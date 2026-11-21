		//#region lib/types/client/provider-order.js
		/** Shared provider display order for the composer and command model pickers. */
		/**
		* Put the account and official providers first, preserving every other relative order.
		* @param groups - Provider groups in catalog order.
		* @returns a sorted copy; model order within each group is unchanged.
		*/
		function orderModelProviders(groups) {
			return groups.toSorted((left, right) => (left.id === "deepseek-account" ? 0 : left.id === "deepseek-official" ? 1 : 2) - (right.id === "deepseek-account" ? 0 : right.id === "deepseek-official" ? 1 : 2));
		}
		/**
		* Fold routes that carry one display name into a single provider group.
		*
		* A provider may be reached through several `llm-pi-ai` routes — one API key
		* each — and the Host catalog keeps them apart by route id, so the picker
		* would otherwise open one group per key. Models keep the route that
		* advertised them in `provider`, so choosing a row still submits that exact
		* route; rows whose id appears on more than one merged route are suffixed
		* with their route id to stay distinguishable.
		* @param groups - Provider groups in catalog order.
		* @returns groups in catalog order with same-named routes folded together;
		* each keeps the first route's id and lists every merged route in `providerIds`.
		*/
		function mergeModelProviders(groups) {
			const byName = /* @__PURE__ */ new Map();
			const merged = [];
			for (const group of groups) {
				const name = (group.name ?? "").trim();
				const key = name === "" ? `id:${group.id}` : `name:${name.toLowerCase()}`;
				let target = byName.get(key);
				if (target === void 0) {
					target = {
						id: group.id,
						name: name === "" ? group.id : name,
						providerIds: [],
						models: []
					};
					byName.set(key, target);
					merged.push(target);
				}
				target.providerIds.push(group.id);
				for (const model of group.models) target.models.push({
					...model,
					provider: group.id
				});
			}
			for (const group of merged) {
				if (group.providerIds.length < 2) continue;
				const occurrences = /* @__PURE__ */ new Map();
				for (const model of group.models) occurrences.set(model.id, (occurrences.get(model.id) ?? 0) + 1);
				for (const model of group.models) {
					if ((occurrences.get(model.id) ?? 0) < 2) continue;
					model.name = `${model.name ?? model.id} · ${model.provider}`;
				}
			}
			return merged;
		}
		//#endregion
