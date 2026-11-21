		//#region lib/types/client/index.js
		/** Model row identity: typed prefix plus an opaque route/model key, resolved by lookup. */
		function rowId(providerId, modelId) {
			return `model:${providerId}/${modelId}`;
		}
		/** Flatten the directory into popup rows; failure rows are listed for visibility but never selectable. */
		function optionsOf(directory, t) {
			const rows = [];
			for (const group of orderModelProviders(mergeModelProviders(directory.groups))) {
				const name = group.id === "deepseek-account" ? t("provider.account") : group.name;
				for (const model of group.models) {
					const route = model.provider ?? group.id;
					rows.push({
						id: rowId(route, model.id),
						label: model.name,
						group: {
							name: group.id,
							label: name
						},
						...directory.current !== null && directory.current.provider === route && directory.current.model === model.id ? { active: true } : {}
					});
				}
			}
			for (const failure of directory.failures) rows.push({
				id: `failure:${failure.id}`,
				label: failure.id === "deepseek-account" ? t("provider.account") : failure.name,
				detail: t("option.loadError", { message: failure.message })
			});
			return rows;
		}
		/**
		* Resolve a picked row back to its model selection by matching against the loaded
		* groups (the same data the rows were built from — ids stay opaque).
		* @param state - the session's directory snapshot.
		* @param id - the picked row id.
		* @returns the row's model selection, or undefined for failure rows / stale ids.
		*/
		function selectionOf(state, id) {
			// Only the first colon is structural; route/model ids may contain ':' or '/'.
			if (typeof id !== "string" || id.slice(0, id.indexOf(":")) !== "model") return;
			for (const group of state.groups) for (const model of group.models) {
				if (rowId(group.id, model.id) !== id) continue;
				const reasoningEffort = state.current?.provider === group.id && state.current.model === model.id ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort : model.reasoning?.defaultEffort;
				return {
					provider: group.id,
					model: model.id,
					...reasoningEffort === void 0 ? {} : { reasoningEffort }
				};
			}
		}
		/** Dictionary namespace owned by this plugin. */
		const NS = "model";
		/** Required services: the contribution registry, the seat's slot registry, locale, and the service's own faces. */
		const inject = [
			"commandUi",
			"locale",
			"sessions",
			"slots",
			"remote",
			"remote.session"
		];
		/**
		* Client plugin body: mount ModelDirectoryResolver, register the `model` dictionaries,
		* then register the /model popup contribution and the composer model seat
		* over the service.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-model-selection: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.plugin(ModelDirectoryResolver);
			ctx.inject(["commandUi", "modelDirectories"], (scope) => {
				const command = scope.get("commandUi");
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.effect(() => command.register({
					name: "model",
					label: () => t("command.label"),
					description: () => t("command.description"),
					icon: _deepseek_ai_dsh_client_ui_primitives.IconDataOutlineRegular,
					available: (session) => sessions.subagentAddress(session.sessionId) === void 0,
					ui: {
						kind: "popupSelect",
						searchMode: "fuzzy-label",
						searchLabels: () => ({
							placeholder: t("search.placeholder"),
							empty: t("empty.models"),
							noResults: t("search.empty")
						}),
						options: async (session) => {
							if (sessions.subagentAddress(session.sessionId) !== void 0) throw new Error("model selection is unavailable for addressed subagent sessions");
							return optionsOf(await models.directoryFor(session.sessionId).load(), t);
						},
						onSelect: async (option, session) => {
							if (sessions.subagentAddress(session.sessionId) !== void 0) throw new Error("model selection is unavailable for addressed subagent sessions");
							const directory = models.directoryFor(session.sessionId);
							const selection = selectionOf(directory.store.getSnapshot(), option.id);
							if (selection === void 0) return;
							const result = await directory.select(selection);
							if (!result.ok) {
								if (result.error.code === "session/writer-held") throw new Error(t("error.sessionInUse"));
								throw result.error;
							}
						}
					}
				}), "ui-model-selection: /model contribution");
			});
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					locale: NS,
					children: { "conversation.input.model.label": {
						kind: "single",
						scope: "session",
						inline: true
					} },
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const available = sessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							directory: directory.store,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => available ? directory.select(selection) : Promise.resolve(void 0)
						};
					}
				}, ModelSelect));
			});
		}
		//#endregion
		exports.ModelDirectory = ModelDirectory;
		exports.ModelDirectoryResolver = ModelDirectoryResolver;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map