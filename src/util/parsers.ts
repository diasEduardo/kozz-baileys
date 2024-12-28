import * as T from '@guigalleta/t-parser';
import { MimeType } from 'file-type';

const dot = T.str('.');
const anythinExceptChars = (chars: string) =>
	T.regexMatch(new RegExp(`^[^${chars}]+`));

const protocol = T.transform(
	T.sequenceOf([
		T.choice([T.str('https'), T.str('http')]),
		T.str('://', 'protocol/domain separator'),
	]),
	({ result }) => result[0]
);

const name = T.regexMatch(/^([A-z0-9-])+/);

const subDomain = name;
const domain = name;

const topLevelDomain = T.transform(
	T.atLeastOne(T.sequenceOf([dot, T.letters])),
	({ result }) => result.flat(1).join('')
);

const port = T.transform(
	T.sequenceOf([T.str(':'), T.digits]),
	({ result }) => result[1]
);

const path = T.transform(
	T.atLeastOne(T.sequenceOf([T.str('/'), name])),
	({ result }) => result.flat(1).join('')
);

const queryParams = T.transform(
	T.atLeastOne(
		T.sequenceOf([
			T.choice([T.str('&'), T.str('?')]),
			T.regexMatch(/^[^=]+/),
			T.str('='),
			T.regexMatch(/^[^?&]+/),
		])
	),
	({ result }) => {
		const params = (result as string[][]).map(([, paramName, , paramValue]) => ({
			[paramName!]: paramValue,
		}));

		return params.reduce((obj, param) => {
			return {
				...obj,
				...param,
			};
		});
	}
);

const fragment = T.transform(
	T.sequenceOf([T.str('#'), T.lettersOrDigits]),
	({ result }) => result[1]
);

const urlParser = T.transform(
	T.sequenceOf([
		protocol,
		T.choice([T.sequenceOf([subDomain, dot, domain]), domain]),
		topLevelDomain,
		T.maybe(port),
		T.maybe(path),
		T.maybe(queryParams),
		T.maybe(fragment),
	]),
	({ result }) => {
		const protocol = result[0];
		const topLevelDomain = result[2];
		const port = result[3];
		const path = result[4];
		const queryParams = result[5];
		const fragment = result[6];

		let domain = {
			subDomain: null,
			domain: null,
		};

		if (Array.isArray(result[1])) {
			domain = {
				subDomain: result[1][0].toLowerCase(),
				domain: result[1][2].toLowerCase(),
			};
		} else {
			domain = {
				subDomain: null,
				domain: result[1].toLowerCase(),
			};
		}

		return {
			protocol,
			...domain,
			topLevelDomain,
			port,
			path,
			queryParams,
			fragment,
		};
	}
);

type UrlParserResult = {
	protocol: string;
	domain: string;
	topLevelDomain: string;
	port: string | undefined;
	path: string | undefined;
	queryParams: Record<string, string> | undefined;
	fragment: string | undefined;
};

export const parseUrl = (url: string) => {
	const { result, error } = T.parse(url, urlParser);

	if (error) {
		return null;
	} else {
		return result as UrlParserResult;
	}
};

const mimeParser = T.transform(
	T.sequenceOf([T.str('data'), T.str(':'), anythinExceptChars(';'), T.str(';')]),
	({ result }) => result[2]
);

const dataParser = T.transform(
	T.sequenceOf([T.str('base64'), T.str(','), anythinExceptChars('')]),
	({ result }) => result[2]
);

const b64UrlParser = T.transform(
	T.sequenceOf([mimeParser, dataParser]),
	({ result }) => ({
		mimeType: result[0],
		data: result[1],
	})
);

type B64UrlParserResult = {
	mimeType: MimeType;
	data: string;
};

export const parseB64Url = (string: string) => {
	const { result, isError } = T.parse(string, b64UrlParser);
	if (isError) {
		return null;
	}
	return result as B64UrlParserResult;
};
