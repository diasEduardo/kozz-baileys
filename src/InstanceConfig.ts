import path from 'path';

const LEGACY_BOUNDARY_NAME = 'kozz-baileys';
const DEFAULT_NAMESPACE = 'default';

const sanitizePathPart = (value: string) => {
	const sanitized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return sanitized || DEFAULT_NAMESPACE;
};

export const boundaryName = process.env.BOUNDARY_NAME || LEGACY_BOUNDARY_NAME;
export const namespace =
	process.env.KOZZ_NAMESPACE || process.env.NAMESPACE || DEFAULT_NAMESPACE;

export const instanceId =
	process.env.BAILEYS_INSTANCE_ID ||
	process.env.KOZZ_INSTANCE_ID ||
	`${namespace}-${boundaryName}`;

const useLegacyPaths =
	!process.env.BAILEYS_INSTANCE_ID &&
	!process.env.KOZZ_INSTANCE_ID &&
	namespace === DEFAULT_NAMESPACE &&
	boundaryName === LEGACY_BOUNDARY_NAME;

const instanceRoot =
	process.env.BAILEYS_INSTANCE_DIR ||
	process.env.KOZZ_INSTANCE_DIR ||
	(useLegacyPaths
		? '.'
		: path.join('instances', sanitizePathPart(instanceId)));

export const appPaths = {
	instanceRoot,
	credsDir: process.env.BAILEYS_AUTH_DIR || path.join(instanceRoot, 'creds'),
	authDbPath:
		process.env.BAILEYS_AUTH_DB_PATH ||
		path.join(instanceRoot, 'baileys-auth.sqlite'),
	realmPath:
		process.env.BAILEYS_REALM_PATH || path.join(instanceRoot, 'default.realm'),
	mediaDir: process.env.BAILEYS_MEDIA_DIR || path.join(instanceRoot, 'medias'),
	debugDir: process.env.BAILEYS_DEBUG_DIR || path.join(instanceRoot, 'debug'),
};

export const describeInstance = () => ({
	boundaryName,
	namespace,
	instanceId,
	instanceRoot,
});
