/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 827:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(105)
const yaml = __nccwpck_require__(982)
const fs = __nccwpck_require__(653)
const path = __nccwpck_require__(622)

__nccwpck_require__(341).config()

const REPLACE_DEFAULT = true

const getVar = ({ key, default: dft, required = false, type = 'string' }) => {
	const coreVar = core.getInput(key)
	const envVar = process.env[key]

	if (key === 'PR_LABELS' && (coreVar === false || envVar === 'false'))
		return undefined

	if (coreVar !== undefined && coreVar.length >= 1) {
		if (type === 'array') return coreVar.split('\n')
		if (type === 'boolean') return coreVar === 'false' ? false : Boolean(coreVar)

		return coreVar
	}

	if (envVar !== undefined && envVar.length >= 1) {
		if (type === 'array') return envVar.split(',')
		if (type === 'boolean') return envVar === 'true'

		return envVar
	}

	if (required === true)
		return core.setFailed(`Variable ${ key } missing.`)

	return dft

}

const context = {
	GITHUB_TOKEN: getVar({
		key: 'GH_PAT',
		required: true
	}),
	GIT_EMAIL: getVar({
		key: 'GIT_EMAIL'
	}),
	GIT_USERNAME: getVar({
		key: 'GIT_USERNAME'
	}),
	CONFIG_PATH: getVar({
		key: 'CONFIG_PATH',
		default: '.github/sync.yml'
	}),
	COMMIT_PREFIX: getVar({
		key: 'COMMIT_PREFIX',
		default: '🔄'
	}),
	COMMIT_EACH_FILE: getVar({
		key: 'COMMIT_EACH_FILE',
		type: 'boolean',
		default: true
	}),
	PR_LABELS: getVar({
		key: 'PR_LABELS',
		default: [ 'sync' ],
		type: 'array'
	}),
	ASSIGNEES: getVar({
		key: 'ASSIGNEES',
		type: 'array'
	}),
	TMP_DIR: getVar({
		key: 'TMP_DIR',
		default: `tmp-${ Date.now().toString() }`
	}),
	DRY_RUN: getVar({
		key: 'DRY_RUN',
		type: 'boolean',
		default: false
	}),
	SKIP_CLEANUP: getVar({
		key: 'SKIP_CLEANUP',
		type: 'boolean',
		default: false
	}),
	OVERWRITE_EXISTING_PR: getVar({
		key: 'OVERWRITE_EXISTING_PR',
		type: 'boolean',
		default: true
	}),
	GITHUB_REPOSITORY: getVar({
		key: 'GITHUB_REPOSITORY',
		required: true
	}),
	SKIP_PR: getVar({
		key: 'SKIP_PR',
		type: 'boolean',
		default: false
	})
}

core.setSecret(context.GITHUB_TOKEN)

core.debug(JSON.stringify(context, null, 2))

const parseRepoName = (fullRepo) => {
	let host = 'github.com'

	if (fullRepo.startsWith('http')) {
		const url = new URL(fullRepo)
		host = url.host

		fullRepo = url.pathname.replace(/^\/+/, '') // Remove leading slash

		core.info('Using custom host')
	}

	const user = fullRepo.split('/')[0]
	const name = fullRepo.split('/')[1].split('@')[0]
	const branch = fullRepo.split('/')[1].split('@')[1] || 'default'

	return {
		fullName: `${ host }/${ user }/${ name }`,
		host,
		user,
		name,
		branch
	}
}

const parseExclude = (text, src) => {
	if (text === undefined || typeof text !== 'string') return undefined

	const files = text.split('\n').filter((i) => i)

	return files.map((file) => path.join(src, file))
}

const parseFiles = (files) => {
	return files.map((item) => {

		if (typeof item === 'string') {
			return {
				source: item,
				dest: item,
				replace: REPLACE_DEFAULT
			}
		}

		if (item.source !== undefined) {
			return {
				source: item.source,
				dest: item.dest !== undefined ? item.dest : item.source,
				replace: item.replace !== undefined ? item.replace : REPLACE_DEFAULT,
				exclude: parseExclude(item.exclude, item.source)
			}
		}

		core.warning('Warn: No source files specified')
	})
}

const parseConfig = async () => {
	const fileContent = await fs.promises.readFile(context.CONFIG_PATH)

	const configObject = yaml.load(fileContent.toString())

	const result = {}

	Object.keys(configObject).forEach((key) => {
		if (key === 'group') {
			const rawObject = configObject[key]

			const groups = Array.isArray(rawObject) ? rawObject : [ rawObject ]

			groups.forEach((group) => {
				const repos = typeof group.repos === 'string' ? group.repos.split('\n').filter((n) => n) : group.repos

				repos.forEach((name) => {
					const files = parseFiles(group.files)
					const repo = parseRepoName(name)

					if (result[repo.fullName] !== undefined) {
						result[repo.fullName].files.push(...files)
						return
					}

					result[repo.fullName] = {
						repo,
						files
					}
				})
			})
		} else {
			const files = parseFiles(configObject[key])
			const repo = parseRepoName(key)

			if (result[repo.fullName] !== undefined) {
				result[repo.fullName].files.push(...files)
				return
			}

			result[repo.fullName] = {
				repo,
				files
			}
		}
	})

	return Object.values(result)
}

while (fs.existsSync(context.TMP_DIR)) {
	context.TMP_DIR = `tmp-${ Date.now().toString() }`
	core.warning(`TEMP_DIR already exists. Using "${ context.TMP_DIR }" now.`)
}

module.exports = {
	...context,
	parseConfig
}

/***/ }),

/***/ 940:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { parse } = __nccwpck_require__(125)
const core = __nccwpck_require__(105)
const path = __nccwpck_require__(622)

const {
	GITHUB_TOKEN,
	GIT_USERNAME,
	GIT_EMAIL,
	TMP_DIR,
	COMMIT_PREFIX,
	GITHUB_REPOSITORY,
	OVERWRITE_EXISTING_PR
} = __nccwpck_require__(827)

const { dedent, execCmd } = __nccwpck_require__(146)

const init = (repo) => {
	let github
	let baseBranch
	let prBranch
	let existingPr

	const workingDir = path.join(TMP_DIR, repo.fullName)
	const gitUrl = `https://${ GITHUB_TOKEN }@${ repo.fullName }.git`

	const clone = () => {
		core.debug(`Cloning ${ repo.fullName } into ${ workingDir }`)

		return execCmd(
			`git clone --depth 1 ${ repo.branch !== 'default' ? '--branch "' + repo.branch + '"' : '' } ${ gitUrl } ${ workingDir }`
		)
	}

	const setIdentity = async (client) => {
		let username = GIT_USERNAME
		let email = GIT_EMAIL
		github = client

		if (email === undefined) {
			const { data } = await github.users.getAuthenticated()
			email = data.email
			username = data.login
		}

		core.debug(`Setting git user to email: ${ email }, username: ${ username }`)

		return execCmd(
			`git config --local user.name "${ username }" && git config --local user.email "${ email }"`,
			workingDir
		)
	}

	const getBaseBranch = async () => {
		baseBranch = await execCmd(
			`git rev-parse --abbrev-ref HEAD`,
			workingDir
		)
	}

	const createPrBranch = async () => {
		let newBranch = `repo-sync/${ GITHUB_REPOSITORY.split('/')[1] }/${ repo.branch }`

		if (OVERWRITE_EXISTING_PR === false) {
			newBranch += `-${ Math.round((new Date()).getTime() / 1000) }`
		}

		core.debug(`Creating PR Branch ${ newBranch }`)

		await execCmd(
			`git checkout -b "${ newBranch }"`,
			workingDir
		)

		prBranch = newBranch
	}

	const add = async (file) => {
		return execCmd(
			`git add -f ${ file }`,
			workingDir
		)
	}

	const hasChanges = async () => {
		const statusOutput = await execCmd(
			`git status --porcelain`,
			workingDir
		)

		return parse(statusOutput).length !== 0
	}

	const commit = async (msg) => {
		const message = msg !== undefined ? msg : `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }`

		return execCmd(
			`git commit -m "${ message }"`,
			workingDir
		)
	}

	const status = async () => {
		return execCmd(
			`git status`,
			workingDir
		)
	}

	const push = async () => {
		return execCmd(
			`git push ${ gitUrl } --force`,
			workingDir
		)
	}

	const findExistingPr = async () => {
		const { data } = await github.pulls.list({
			owner: repo.user,
			repo: repo.name,
			state: 'open',
			head: `${ repo.user }:${ prBranch }`
		})

		existingPr = data[0]

		return existingPr
	}

	const setPrWarning = async () => {
		await github.pulls.update({
			owner: repo.user,
			repo: repo.name,
			pull_number: existingPr.number,
			body: dedent(`
				⚠️ This PR is being automatically resynced ⚠️

				${ existingPr.body }
			`)
		})
	}

	const removePrWarning = async () => {
		await github.pulls.update({
			owner: repo.user,
			repo: repo.name,
			pull_number: existingPr.number,
			body: existingPr.body.replace('⚠️ This PR is being automatically resynced ⚠️', '')
		})
	}

	const createOrUpdatePr = async (changedFiles) => {
		const body = dedent(`
			Synced local file(s) with [${ GITHUB_REPOSITORY }](https://github.com/${ GITHUB_REPOSITORY }).

			${ changedFiles }

			---

			This PR was created automatically by the [repo-file-sync-action](https://github.com/BetaHuhn/repo-file-sync-action) workflow run [#${ process.env.GITHUB_RUN_ID || 0 }](https://github.com/${ GITHUB_REPOSITORY }/actions/runs/${ process.env.GITHUB_RUN_ID || 0 })
		`)

		if (existingPr) {
			core.info(`Overwriting existing PR`)

			const { data } = await github.pulls.update({
				owner: repo.user,
				repo: repo.name,
				pull_number: existingPr.number,
				body: body
			})

			return data
		}

		core.info(`Creating new PR`)

		const { data } = await github.pulls.create({
			owner: repo.user,
			repo: repo.name,
			title: `${ COMMIT_PREFIX } Synced file(s) with ${ GITHUB_REPOSITORY }`,
			body: body,
			head: prBranch,
			base: baseBranch
		})

		return data
	}

	return {
		workingDir,
		clone,
		setIdentity,
		getBaseBranch,
		createPrBranch,
		add,
		hasChanges,
		commit,
		status,
		push,
		findExistingPr,
		setPrWarning,
		removePrWarning,
		createOrUpdatePr
	}
}

module.exports = {
	init
}

/***/ }),

/***/ 146:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const fs = __nccwpck_require__(653)
const { exec } = __nccwpck_require__(129)
const core = __nccwpck_require__(105)

// From https://github.com/toniov/p-iteration/blob/master/lib/static-methods.js - MIT © Antonio V
const forEach = async (array, callback) => {
	for (let index = 0; index < array.length; index++) {
		// eslint-disable-next-line callback-return
		await callback(array[index], index, array)
	}
}

// From https://github.com/MartinKolarik/dedent-js/blob/master/src/index.ts - MIT © 2015 Martin Kolárik
const dedent = function(templateStrings, ...values) {
	const matches = []
	const strings = typeof templateStrings === 'string' ? [ templateStrings ] : templateStrings.slice()
	strings[strings.length - 1] = strings[strings.length - 1].replace(/\r?\n([\t ]*)$/, '')
	for (let i = 0; i < strings.length; i++) {
		let match
		// eslint-disable-next-line no-cond-assign
		if (match = strings[i].match(/\n[\t ]+/g)) {
			matches.push(...match)
		}
	}
	if (matches.length) {
		const size = Math.min(...matches.map((value) => value.length - 1))
		const pattern = new RegExp(`\n[\t ]{${ size }}`, 'g')
		for (let i = 0; i < strings.length; i++) {
			strings[i] = strings[i].replace(pattern, '\n')
		}
	}
	strings[0] = strings[0].replace(/^\r?\n/, '')
	let string = strings[0]
	for (let i = 0; i < values.length; i++) {
		string += values[i] + strings[i + 1]
	}
	return string
}

const execCmd = (command, workingDir) => {
	core.debug(`EXEC: "${ command }" IN ${ workingDir }`)
	return new Promise((resolve, reject) => {
		exec(
			command,
			{
				cwd: workingDir
			},
			function(error, stdout) {
				error ? reject(error) : resolve(stdout.trim())
			}
		)
	})
}

const addTrailingSlash = (str) => str.endsWith('/') ? str : str + '/'

const pathIsDirectory = async (path) => {
	const stat = await fs.lstat(path)
	return stat.isDirectory()
}

const copy = async (src, dest, exclude) => {

	core.debug(`CP: ${ src } TO ${ dest }`)

	const filterFunc = (file) => {

		if (exclude.includes(file)) {
			core.debug(`Excluding file ${ file }`)
			return false
		}

		return true
	}

	return fs.copy(src, dest, (exclude !== undefined && { filter: filterFunc }))
}

const remove = async (src) => {

	core.debug(`RM: ${ src }`)

	return fs.remove(src)
}

module.exports = {
	forEach,
	dedent,
	addTrailingSlash,
	pathIsDirectory,
	execCmd,
	copy,
	remove
}

/***/ }),

/***/ 105:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 82:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 125:
/***/ ((module) => {

module.exports = eval("require")("@putout/git-status-porcelain");


/***/ }),

/***/ 341:
/***/ ((module) => {

module.exports = eval("require")("dotenv");


/***/ }),

/***/ 653:
/***/ ((module) => {

module.exports = eval("require")("fs-extra");


/***/ }),

/***/ 982:
/***/ ((module) => {

module.exports = eval("require")("js-yaml");


/***/ }),

/***/ 129:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");;

/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = require("fs");;

/***/ }),

/***/ 622:
/***/ ((module) => {

"use strict";
module.exports = require("path");;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(105)
const github = __nccwpck_require__(82)
const fs = __nccwpck_require__(747)

const Git = __nccwpck_require__(940)
const { forEach, dedent, addTrailingSlash, pathIsDirectory, copy, remove } = __nccwpck_require__(146)

const {
	parseConfig,
	GITHUB_TOKEN,
	COMMIT_EACH_FILE,
	COMMIT_PREFIX,
	PR_LABELS,
	ASSIGNEES,
	DRY_RUN,
	TMP_DIR,
	SKIP_CLEANUP,
	OVERWRITE_EXISTING_PR,
	SKIP_PR
} = __nccwpck_require__(827)

const run = async () => {
	const client = new github.GitHub(GITHUB_TOKEN)

	const repos = await parseConfig()

	await forEach(repos, async (item) => {
		core.info(`Repository Info`)
		core.info(`Slug		: ${ item.repo.name }`)
		core.info(`Owner		: ${ item.repo.user }`)
		core.info(`Https Url	: https://${ item.repo.fullName }`)
		core.info(`Branch		: ${ item.repo.branch }`)
		core.info('	')
		try {
			const git = Git.init(item.repo)

			// Clone and setup the git repository locally
			await git.clone()
			await git.setIdentity(client)
			await git.getBaseBranch()

			let existingPr
			if (SKIP_PR === false) {
				await git.createPrBranch()

				// Check for existing PR and add warning message that the PR maybe about to change
				existingPr = OVERWRITE_EXISTING_PR ? await git.findExistingPr() : undefined
				if (existingPr && DRY_RUN === false) {
					core.info(`Found existing PR ${ existingPr.number }`)
					await git.setPrWarning()
				}
			}

			core.info(`Locally syncing file(s) between source and target repository`)
			const modified = []

			// Loop through all selected files of the source repo
			await forEach(item.files, async (file) => {
				const fileExists = fs.existsSync(file.source)
				if (fileExists === false) return core.warning(`Source ${ file.source } not found`)

				const localDestination = `${ git.workingDir }/${ file.dest }`

				const destExists = fs.existsSync(localDestination)
				if (destExists === true && file.replace === false) return core.warning(`File(s) already exist(s) in destination and 'replace' option is set to false`)

				const isDirectory = await pathIsDirectory(file.source)
				const source = isDirectory ? `${ addTrailingSlash(file.source) }` : file.source

				if (isDirectory) core.warning(`Source is directory`)

				await copy(source, localDestination, file.exclude)

				await git.add(file.dest)

				// Commit each file separately, if option is set to false commit all files at once later
				if (COMMIT_EACH_FILE === true) {
					const hasChanges = await git.hasChanges()

					if (hasChanges === false) return core.debug('File(s) already up to date')

					core.debug(`Creating commit for file(s) ${ file.dest }`)

					// Use different commit/pr message based on if the source is a directory or file
					const directory = isDirectory ? 'directory' : ''
					const otherFiles = isDirectory ? 'and copied all sub files/folders' : ''

					const message = {
						true: {
							commit: `${ COMMIT_PREFIX } Synced local '${ file.dest }' with remote '${ file.source }'`,
							pr: `Synced local ${ directory } <code>${ file.dest }</code> with remote ${ directory } <code>${ file.source }</code>`
						},
						false: {
							commit: `${ COMMIT_PREFIX } Created local '${ file.dest }' from remote '${ file.source }'`,
							pr: `Created local ${ directory } <code>${ file.dest }</code> ${ otherFiles } from remote ${ directory } <code>${ file.source }</code>`
						}
					}

					// Commit and add file to modified array so we later know if there are any changes to actually push
					await git.commit(message[destExists].commit)
					modified.push({
						dest: file.dest,
						source: file.source,
						message: message[destExists].pr
					})
				}
			})

			if (DRY_RUN) {
				core.warning('Dry run, no changes will be pushed')

				core.debug('Git Status:')
				core.debug(await git.status())

				return
			}

			const hasChanges = await git.hasChanges()

			// If no changes left and nothing was modified we can assume nothing has changed/needs to be pushed
			if (hasChanges === false && modified.length < 1) {
				core.info('File(s) already up to date')

				if (existingPr) await git.removePrWarning()

				return
			}

			// If there are still local changes left (i.e. not committed each file separately), commit them before pushing
			if (hasChanges === true) {
				core.debug(`Creating commit for remaining files`)

				await git.commit()
				modified.push({
					dest: git.workingDir
				})
			}

			core.info(`Pushing changes to target repository`)
			await git.push()

			if (SKIP_PR === false) {
				// If each file was committed separately, list them in the PR description
				const changedFiles = dedent(`
					<details>
					<summary>Changed files</summary>
					<ul>
					${ modified.map((file) => `<li>${ file.message }</li>`).join('') }
					</ul>
					</details>
				`)

				const pullRequest = await git.createOrUpdatePr(COMMIT_EACH_FILE ? changedFiles : '')

				core.info(`Pull Request #${ pullRequest.number } created/updated: ${ pullRequest.html_url }`)

				core.setOutput('pull_request_number', pullRequest.number)
				core.setOutput('pull_request_url', pullRequest.html_url)

				if (PR_LABELS !== undefined && PR_LABELS.length > 0) {
					core.info(`Adding label(s) "${ PR_LABELS.join(', ') }" to PR`)
					await client.issues.addLabels({
						owner: item.repo.user,
						repo: item.repo.name,
						issue_number: pullRequest.number,
						labels: PR_LABELS
					})
				}

				if (ASSIGNEES !== undefined && ASSIGNEES.length > 0) {
					core.info(`Adding assignee(s) "${ ASSIGNEES.join(', ') }" to PR`)
					await client.issues.addAssignees({
						owner: item.repo.user,
						repo: item.repo.name,
						issue_number: pullRequest.number,
						assignees: ASSIGNEES
					})
				}
			}

			core.info('	')
		} catch (err) {
			core.error(err.message)
			core.error(err)
		}
	})

	if (SKIP_CLEANUP === true) {
		core.info('Skipping cleanup')
		return
	}

	await remove(TMP_DIR)
	core.info('Cleanup complete')
}

run()
	.then(() => {})
	.catch((err) => {
		core.error('ERROR', err)
		core.setFailed(err.message)
	})
})();

module.exports = __webpack_exports__;
/******/ })()
;