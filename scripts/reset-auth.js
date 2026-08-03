#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sqlite3 = require('sqlite3');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipPm2 = args.has('--no-pm2');

const projectRoot = path.resolve(__dirname, '..');

const LEGACY_BOUNDARY_NAME = 'kozz-baileys';
const DEFAULT_NAMESPACE = 'default';

const sanitizePathPart = value => {
	const sanitized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return sanitized || DEFAULT_NAMESPACE;
};

const resolveProjectPath = value =>
	path.isAbsolute(value) ? value : path.resolve(projectRoot, value);

const boundaryName = process.env.BOUNDARY_NAME || LEGACY_BOUNDARY_NAME;
const namespace =
	process.env.KOZZ_NAMESPACE || process.env.NAMESPACE || DEFAULT_NAMESPACE;
const instanceId =
	process.env.BAILEYS_INSTANCE_ID ||
	process.env.KOZZ_INSTANCE_ID ||
	`${namespace}-${boundaryName}`;
const useLegacyPaths =
	!process.env.BAILEYS_INSTANCE_ID &&
	!process.env.KOZZ_INSTANCE_ID &&
	namespace === DEFAULT_NAMESPACE &&
	boundaryName === LEGACY_BOUNDARY_NAME;
const instanceRoot = resolveProjectPath(
	process.env.BAILEYS_INSTANCE_DIR ||
		process.env.KOZZ_INSTANCE_DIR ||
		(useLegacyPaths ? '.' : path.join('instances', sanitizePathPart(instanceId)))
);
const dbPath = resolveProjectPath(
	process.env.BAILEYS_AUTH_DB_PATH ||
		path.join(instanceRoot, 'baileys-auth.sqlite')
);
const credsDir = resolveProjectPath(
	process.env.BAILEYS_AUTH_DIR || path.join(instanceRoot, 'creds')
);
const pm2ProcessName = process.env.BAILEYS_PM2_PROCESS || 'kozz-baileys';

const runSql = (db, sql, params = []) =>
	new Promise((resolve, reject) => {
		db.run(sql, params, err => {
			if (err) {
				reject(err);
				return;
			}

			resolve();
		});
	});

const getSql = (db, sql, params = []) =>
	new Promise((resolve, reject) => {
		db.get(sql, params, (err, row) => {
			if (err) {
				reject(err);
				return;
			}

			resolve(row);
		});
	});

const closeDb = db =>
	new Promise((resolve, reject) => {
		db.close(err => {
			if (err) {
				reject(err);
				return;
			}

			resolve();
		});
	});

const runPm2 = action => {
	if (skipPm2) {
		return;
	}

	if (dryRun) {
		console.log(`[dry-run] pm2 ${action} ${pm2ProcessName}`);
		return;
	}

	try {
		execFileSync('pm2', [action, pm2ProcessName], {
			stdio: 'inherit',
			cwd: projectRoot,
		});
	} catch (error) {
		console.warn(`[reset-auth] pm2 ${action} failed; continuing.`);
	}
};

const resetSqliteAuth = async () => {
	if (!fs.existsSync(dbPath)) {
		console.log(`[reset-auth] SQLite auth DB not found: ${dbPath}`);
		return 0;
	}

	if (dryRun) {
		console.log(`[dry-run] clear baileys_auth_state in ${dbPath}`);
		return 0;
	}

	const db = new sqlite3.Database(
		dbPath,
		sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
	);

	try {
		await runSql(
			db,
			`CREATE TABLE IF NOT EXISTS baileys_auth_state (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)`
		);

		const row = await getSql(
			db,
			'SELECT COUNT(*) AS count FROM baileys_auth_state'
		);

		await runSql(db, 'DELETE FROM baileys_auth_state');
		await runSql(db, 'PRAGMA wal_checkpoint(TRUNCATE)').catch(() => undefined);

		return row?.count || 0;
	} finally {
		await closeDb(db);
	}
};

const resetLegacyCreds = () => {
	if (!fs.existsSync(credsDir)) {
		return 0;
	}

	const files = fs
		.readdirSync(credsDir)
		.filter(file => file.endsWith('.json'));

	for (const file of files) {
		const filePath = path.join(credsDir, file);
		if (dryRun) {
			console.log(`[dry-run] delete ${filePath}`);
			continue;
		}

		fs.rmSync(filePath, { force: true });
	}

	return files.length;
};

const main = async () => {
	console.log('[reset-auth] Resetting kozz-baileys auth state...');
	console.log(`[reset-auth] SQLite DB: ${dbPath}`);
	console.log(`[reset-auth] Legacy creds dir: ${credsDir}`);

	runPm2('stop');

	const sqliteKeysDeleted = await resetSqliteAuth();
	const legacyFilesDeleted = resetLegacyCreds();

	console.log(
		`[reset-auth] Cleared ${sqliteKeysDeleted} SQLite auth keys and ${legacyFilesDeleted} legacy creds files.`
	);

	runPm2('restart');

	console.log('[reset-auth] Done. kozz-baileys should request a new QR.');
};

main().catch(error => {
	console.error('[reset-auth] Failed:', error);
	process.exit(1);
});
