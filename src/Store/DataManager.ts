import Realm from 'realm';
import {
	contactSchema,
	EntityMap,
	groupChatSchema,
	mediaSchema,
	messageSchema,
} from './models';

export const initDatabase = () => {
	const config = {
		schema: [contactSchema, mediaSchema, messageSchema, groupChatSchema],
		schemaVersion: 0,
	};

	const instance = new Realm(config);

	/**
	 * Upserts the entity and returns the new Object.
	 * @param entityType
	 * @param data
	 * @returns
	 */
	const upsert = <Type extends keyof EntityMap>(
		entityType: Type,
		data: Partial<EntityMap[Type]> & { id: string }
	) => {
		try {
			let obj = {} as EntityMap[Type];
			instance.write(() => {
				obj = instance
					.create(entityType, { ...data }, Realm.UpdateMode.Modified)
					.toJSON() as EntityMap[Type];
			});

			return obj;
		} catch (e) {
			console.warn(
				`Error while upserting ${JSON.stringify(
					data,
					undefined,
					'  '
				)} with data ${data}. No database transaction was done. Error = ${e}`
			);
			return undefined;
		}
	};

	const getValues = <Type extends keyof EntityMap>(
		entityType: Type,
		filterFn: (data: EntityMap[Type]) => boolean
	) => {
		try {
			return instance
				.objects(entityType)
				.map(obj => obj.toJSON() as EntityMap[Type])
				.filter(filterFn);
		} catch (e) {
			console.warn(
				`Error while fetching ${entityType}. No database transaction was done. Error = ${e}`
			);
			return undefined;
		}
	};

	const getById = <Type extends keyof EntityMap>(entityType: Type, id: string) => {
		try {
			return instance
				.objectForPrimaryKey(entityType, id)
				?.toJSON() as EntityMap[Type];
		} catch (e) {
			console.warn(
				`Error while fetcing ${entityType} with primaryKey ${id}. No database transaction was done. Error = ${e}`
			);
			return undefined;
		}
	};

	const deleteValues = <Type extends keyof EntityMap>(
		entityType: Type,
		filterFn: (data: EntityMap[Type]) => boolean
	) => {
		try {
			let count = 0;
			instance.write(() => {
				instance
					.objects(entityType)
					.filter(obj => filterFn(obj.toJSON() as EntityMap[Type]))
					.forEach(obj => {
						instance.delete(obj);
						count++;
					});
			});

			return count;
		} catch (e) {
			console.warn(
				`Error while deleting ${entityType}. No database transaction was done. Error = ${e}`
			);
			return 0;
		}
	};

	return {
		upsert,
		getValues,
		deleteValues,
		getById,
	};
};
