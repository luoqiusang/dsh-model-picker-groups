		//#region lib/types/client/ModelSelect.js
		/**
		* ModelSelect: the composer's named model seat (`conversation.input.model`).
		* Two-level selection per figma 496:26454's MenuDropdown: the root menu is
		* the Model / Effort row pair (label + current value + a right chevron),
		* each drilling into its own list — the provider-grouped model list over
		* the shared directory, and the effort levels. The trigger (313:14108's
		* ToggleButton) shows both: model name + effort in the caption tone.
		* Model catalogs always show search, which retains focus while
		* ↑/↓ cycle the highlighted result; Enter and Tab accept it. Root
		* panes and effort panes move focus between rows. Escape clears search first, then leaves a drilled pane and otherwise closes
		* back to the trigger. A drilled pane focuses the current effort or model
		* search field. Provider headings paint their background only while pinned
		* by scrolling. Clearing a query restores the full list and search focus.
		* Selecting restores trigger focus without a ring until the trigger loses focus
		* or the menu reopens. Group names, model names and ids match through
		* rankByName's case-insensitive ordered subsequence, preserving catalog order.
		* Returning to the root pane
		* hands focus back to the cell that opened it. Data and submission ride the
		* same per-session ModelDirectory as the /model popup; exact-model reasoning
		* metadata and the selected effort come from the Host rather than a
		* client-owned vocabulary. A rejected selection announces through the shared
		* transient Toast anchored to the composer card; the in-menu strip with
		* Retry remains the catalog-load surface. While the directory's pending
		* selection is unsettled, the trigger shows a spinner in place of its
		* chevron, and each row whose value that selection carries shows one in place
		* of its check mark.
		*/
		const FAVORITES_KEY = "dsh-model-picker-groups.favorites";
		const readFavorites = () => {
			try {
				const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
				return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string"))] : [];
			} catch {
				return [];
			}
		};
		/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real (Menu primitive's measure pass). */
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};
		/**
		* Render the composer model seat.
		* @param props - owner share (locked) + injected face (shared directory
		* store/verbs) + the standard locale seat.
		* @returns the trigger and, while open, the two-level menu.
		*/
		function ModelSelect({ locked, available, directory, load, select, t, renderSlot }) {
			const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const [query, setQuery] = (0, react.useState)("");
			const [expandedOverrides, setExpandedOverrides] = (0, react.useState)({});
			const [favorites, setFavorites] = (0, react.useState)(readFavorites);
			const [favoritesCollapsed, setFavoritesCollapsed] = (0, react.useState)(false);
			const [highlightedIndex, setHighlightedIndex] = (0, react.useState)(null);
			const [selectionFocus, setSelectionFocus] = (0, react.useState)(false);
			const lastActionRef = (0, react.useRef)("load");
			const [toast, setToast] = (0, react.useState)(null);
			const toastSeq = (0, react.useRef)(0);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const searchRef = (0, react.useRef)(null);
			const menuRef = (0, react.useRef)(null);
			const groupsRef = (0, react.useRef)(null);
			const spacerRef = (0, react.useRef)(null);
			const groupToggleRef = (0, react.useRef)(null);
			const groupScrollSeq = (0, react.useRef)(0);
			const [spacerHeight, setSpacerHeight] = (0, react.useState)(0);
			const [menuPos, setMenuPos] = (0, react.useState)(null);
			const itemRefs = (0, react.useRef)([]);
			const id = (0, react.useId)();
			const accountProviderName = t("provider.account");
			const groups = (0, react.useMemo)(() => orderModelProviders(mergeModelProviders(state.groups)).map((group) => ({
				...group,
				provider: {
					id: group.id,
					name: group.id === "deepseek-account" ? accountProviderName : group.name ?? group.id
				}
			})), [state.groups, accountProviderName]);
			const routeProvider = (group, model) => ({
				id: model.provider ?? group.id,
				name: group.provider.name
			});
			const choices = (0, react.useMemo)(() => groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				selection: {
					provider: model.provider ?? group.id,
					model: model.id,
					...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort }
				}
			}))), [groups]);
			const showSearch = true;
			const filteredGroups = (0, react.useMemo)(() => {
				const text = query.trim();
				if (text === "") return groups.filter((group) => group.models.length > 0);
				const rank = _deepseek_ai_dsh_client_ui_primitives.rankByName;
				return groups.map((group) => {
					if (rank([{ name: group.name }, { name: group.provider.name }], text).length > 0) return group;
					const matches = new Set(rank(group.models, text));
					for (const item of rank(group.models.map((model) => ({ name: model.id, model })), text)) matches.add(item.model);
					return { ...group, models: group.models.filter((model) => matches.has(model)) };
				}).filter((group) => group.models.length > 0);
			}, [groups, query]);
			const searching = query.trim() !== "";
			const groupHoldsCurrent = (group) => state.current !== null && group.providerIds.includes(state.current.provider);
			const isGroupExpanded = (group) => searching || (expandedOverrides[group.id] ?? groupHoldsCurrent(group));
			const favoritesExpanded = !favoritesCollapsed;
			const scrollGroupToTop = (node) => {
				const seq = groupScrollSeq.current;
				const align = (verify = false) => {
					const container = groupsRef.current;
					if (seq !== groupScrollSeq.current || container === null || !container.contains(node) || node.getAttribute("aria-expanded") !== "true") return;
					const target = Math.max(0, node.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 4);
					if (verify && Math.abs(container.scrollTop - target) <= 1) return;
					if (typeof container.scrollTo === "function") {
						container.scrollTo({ top: target, behavior: "auto" });
					} else {
						container.scrollTop = target;
					}
				};
				requestAnimationFrame(() => {
					align();
					requestAnimationFrame(() => align(true));
				});
			};
			// Both row rendering and keyboard indices consume this exact ordered list.
			const renderedGroups = (0, react.useMemo)(() => {
				const starred = searching ? [] : choices.filter(({ selection }) => favorites.includes(`${selection.provider}/${selection.model}`));
				return [...starred.length === 0 ? [] : [{ group: null, entries: favoritesCollapsed ? [] : starred }], ...filteredGroups.map((group) => ({
					group,
					entries: isGroupExpanded(group) ? group.models.map((model) => ({ group, model })) : []
				}))];
			}, [choices, favorites, favoritesCollapsed, filteredGroups, searching, expandedOverrides, state.current?.provider]);
			const visibleModels = (0, react.useMemo)(() => renderedGroups.flatMap(({ entries }) => entries.map(({ group, model }) => ({
				provider: model.provider ?? group.id,
				model: model.id
			}))), [renderedGroups]);
			const currentVisibleIndex = visibleModels.findIndex((model) => model.provider === state.current?.provider && model.model === state.current.model);
			const activeModelIndex = Math.min(highlightedIndex ?? Math.max(0, currentVisibleIndex), visibleModels.length - 1);
			const currentChoice = choices[state.current === null ? -1 : choices.findIndex((c) => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)];
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = currentChoice === void 0 ? void 0 : reasoning === void 0 ? state.retainedEffort : effectiveEffort === void 0 ? t("effort.providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("effort.providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name
			}))], [reasoning, t]);
			const { pending } = state;
			const busy = pending !== null;
			const reload = () => {
				lastActionRef.current = "load";
				load();
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (rootRef.current?.contains(event.target) === true) return;
					if (menuRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			const paneFocus = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const intent = paneFocus.current;
				paneFocus.current = null;
				if (!available || !open) return;
				if (pane === "model") {
					searchRef.current?.focus();
					return;
				}
				if (intent === null) return;
				if (intent === "drill") {
					(menuRef.current?.querySelector("[role=\"menuitemradio\"][aria-checked=\"true\"]:not([disabled])") ?? itemRefs.current.find((item) => item !== null && !item.disabled) ?? triggerRef.current)?.focus();
					return;
				}
				const cell = itemRefs.current[intent === "effort" ? 1 : 0];
				(cell !== null && cell !== void 0 && !cell.disabled ? cell : triggerRef.current)?.focus();
			}, [available, open, pane]);
			// Headings are static: do not attach the platform's data-stuck observer.
			(0, react.useLayoutEffect)(() => {
				if (!available || !open || pane !== "model") {
					setSpacerHeight(0);
					return;
				}
				const viewport = groupsRef.current;
				const measure = () => {
					if (viewport === null) return;
					const spacer = spacerRef.current;
					// Measure natural content, not scrollHeight (which is floored at clientHeight).
					const origin = viewport.getBoundingClientRect().top - viewport.scrollTop;
					const reduced = spacer === null ? 0 : spacer.getBoundingClientRect().top - origin;
					const headings = viewport.querySelectorAll(":scope > [data-menu-group] > [data-menu-group-heading]");
					const last = headings[headings.length - 1] ?? null;
					const tail = last === null ? reduced : reduced - (last.getBoundingClientRect().top - origin);
					const toggle = groupToggleRef.current;
					const preserve = toggle?.expand === false ? toggle.scrollTop : 0;
					const height = Math.max(0, Math.ceil(viewport.clientHeight - tail), Math.ceil(preserve + viewport.clientHeight - reduced));
					// Apply before paint, so collapse cannot leave a scroll-range clamp visible.
					if (spacer !== null) spacer.style.height = `${height}px`;
					setSpacerHeight(height);
					if (toggle?.expand === false && viewport.scrollTop !== preserve) viewport.scrollTop = preserve;
				};
				measure();
				const observer = typeof ResizeObserver !== "undefined" && viewport !== null ? new ResizeObserver(measure) : null;
				if (viewport !== null) observer?.observe(viewport);
				window.addEventListener("resize", measure);
				return () => {
					observer?.disconnect();
					window.removeEventListener("resize", measure);
				};
			}, [available, open, pane, renderedGroups]);
			(0, react.useLayoutEffect)(() => {
				itemRefs.current.length = pane === "model" ? visibleModels.length : pane === "effort" ? effortChoices.length : reasoning === void 0 ? 1 : 2;
			}, [pane, visibleModels.length, effortChoices.length, reasoning]);
			(0, react.useLayoutEffect)(() => {
				// A group toggle owns positioning; changed row indices must not scroll a model.
				if (groupToggleRef.current !== null) {
					groupToggleRef.current = null;
					return;
				}
				if (open && pane === "model" && activeModelIndex >= 0) itemRefs.current[activeModelIndex]?.scrollIntoView({ block: "nearest" });
			}, [
				open,
				pane,
				activeModelIndex,
				visibleModels
			]);
			(0, react.useLayoutEffect)(() => {
				if (!available || !open) {
					setMenuPos(null);
					return;
				}
				const place = () => {
					/* v8 ignore next 2 -- the trigger ref is attached whenever the menu is open. */
					const rect = triggerRef.current?.getBoundingClientRect();
					if (rect === void 0) return;
					const MARGIN = 12;
					const lw = menuRef.current?.offsetWidth ?? 0;
					const lh = menuRef.current?.offsetHeight ?? 0;
					let x = rect.right - lw;
					let y = rect.top - 8 - lh;
					if (lw > 0) x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN);
					if (lh > 0) y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN);
					setMenuPos({
						left: x,
						top: y
					});
				};
				place();
				window.addEventListener("scroll", place, true);
				window.addEventListener("resize", place);
				const menu = menuRef.current;
				const observer = typeof ResizeObserver !== "undefined" && menu !== null ? new ResizeObserver(place) : null;
				if (menu !== null) observer?.observe(menu);
				return () => {
					observer?.disconnect();
					window.removeEventListener("scroll", place, true);
					window.removeEventListener("resize", place);
				};
			}, [
				available,
				open,
				pane,
				state,
				query
			]);
			if (!available) return null;
			const openAt = (next) => {
				setSelectionFocus(false);
				triggerRef.current?.focus();
				setQuery("");
				setExpandedOverrides({});
				setHighlightedIndex(null);
				setFavorites(readFavorites());
				setFavoritesCollapsed(false);
				paneFocus.current = "drill";
				setPane(next);
				setOpen(true);
				reload();
			};
			/** Open the menu straight on the model list; the effort chip opens the effort list. */
			const show = () => {
				openAt("model");
			};
			const changeQuery = (next) => {
				setQuery(next);
				setHighlightedIndex(0);
			};
			const close = (restoreFocus = false) => {
				setOpen(false);
				setPane("root");
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const closeAfterSelection = () => {
				setSelectionFocus(true);
				close(true);
			};
			const drill = (next) => {
				setQuery("");
				setHighlightedIndex(null);
				paneFocus.current = "drill";
				setPane(next);
			};
			/** Leave a drilled pane for the root one, handing the keyboard back to its cell. */
			const back = (from) => {
				paneFocus.current = from;
				setPane("root");
			};
			const moveFocus = (offset) => {
				const items = itemRefs.current.filter((item) => item !== null);
				if (items.length === 0) return;
				const active = items.findIndex((item) => item === document.activeElement);
				items[active === -1 ? offset > 0 ? 0 : items.length - 1 : (active + offset + items.length) % items.length]?.focus();
			};
			const onRootKeyDown = (event) => {
				if (event.nativeEvent.isComposing) return;
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane === "model" && query !== "") changeQuery("");
					else if (pane !== "root") back(pane);
					else close(true);
					return;
				}
				if (!open) return;
				if (pane === "model" && showSearch && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
					event.preventDefault();
					if (!busy && visibleModels.length > 0) {
						setHighlightedIndex((activeModelIndex + (event.key === "ArrowDown" ? 1 : -1) + visibleModels.length) % visibleModels.length);
						searchRef.current?.focus();
					}
					return;
				}
				if (pane === "model" && showSearch && event.target instanceof HTMLInputElement && (event.key === "Enter" || event.key === "Tab" && !event.shiftKey)) {
					if (event.key === "Tab" && visibleModels.length === 0) return;
					event.preventDefault();
					const highlighted = visibleModels[activeModelIndex];
					if (!busy && highlighted !== void 0) choose(highlighted);
					return;
				}
				if (event.key === "Tab") {
					if (event.shiftKey) {
						event.preventDefault();
						if (pane !== "root" && currentChoice !== void 0) back(pane);
						else close(true);
						return;
					}
					const focused = document.activeElement;
					const rows = itemRefs.current.filter((item) => item !== null);
					if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
						event.preventDefault();
						focused.click();
						return;
					}
					if (focused !== triggerRef.current) return;
					event.preventDefault();
					if (pane === "model" && showSearch) {
						setHighlightedIndex(null);
						searchRef.current?.focus();
						return;
					}
					(menuRef.current?.querySelector("[role=\"menuitemradio\"][aria-checked=\"true\"]:not([disabled])") ?? rows.find((item) => !item.disabled))?.focus();
					return;
				}
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};
			const onBlur = (event) => {
				if (event.relatedTarget instanceof Node && (rootRef.current?.contains(event.relatedTarget) === true || menuRef.current?.contains(event.relatedTarget) === true)) return;
				close();
			};
			const settleSelection = (result) => {
				if (result === void 0) return;
				if (result.ok) {
					if (rootRef.current !== null) closeAfterSelection();
					return;
				}
				const { error } = result;
				toastSeq.current += 1;
				setToast({
					seq: toastSeq.current,
					text: error.code === "session/writer-held" ? t("error.sessionInUse") : t("error.action", { message: `${error.code}: ${error.message}` })
				});
			};
			const submit = (selection) => {
				lastActionRef.current = "select";
				setSelectionFocus(true);
				triggerRef.current?.focus();
				select(selection).then(settleSelection);
			};
			const choose = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					closeAfterSelection();
					return;
				}
				submit(selection);
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					closeAfterSelection();
					return;
				}
				submit({
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				});
			};
			const waiting = currentChoice === void 0 && state.status === "loading";
			const modelLabel = waiting ? t("trigger.loading") : currentChoice?.model.name ?? t("trigger.fallback");
			const triggerLabel = effortLabel === void 0 ? modelLabel : `${modelLabel} · ${effortLabel}`;
			const triggerAria = waiting ? t("trigger.loading") : currentChoice === void 0 ? t("trigger.selectAria") : effortLabel === void 0 ? t("trigger.aria", { model: modelLabel }) : t("trigger.ariaEffort", {
				model: modelLabel,
				effort: effortLabel
			});
			const renderModelLabel = (provider, model, placement, selected) => (0, react_jsx_runtime.jsx)("span", {
				"data-provider-id": provider.id,
				"data-model-id": model.id,
				children: renderSlot("conversation.input.model.label", {
					provider,
					model,
					placement,
					selected
				}, { fallback: model.name })
			});
			const toggleFavorite = (key) => {
				const next = favorites.includes(key) ? favorites.filter((item) => item !== key) : [...favorites, key];
				setFavorites(next);
				setHighlightedIndex(null);
				try {
					localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
				} catch {}
			};
			let itemIndex = 0;
			let modelIndex = 0;
			const itemRef = () => {
				const at = itemIndex++;
				return (node) => {
					itemRefs.current[at] = node;
				};
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: ModelSelect_module_css_default.root,
				onKeyDown: onRootKeyDown,
				onBlur,
				onMouseDown: (event) => {
					if (event.target instanceof Element && event.target.closest("button") !== null) event.preventDefault();
				},
				children: [
					(0, react_jsx_runtime.jsxs)("button", {
						ref: triggerRef,
						type: "button",
						className: ModelSelect_module_css_default.trigger,
						"aria-label": triggerAria,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-controls": open ? `${id}-menu` : void 0,
						title: triggerLabel,
						"aria-busy": busy,
						"data-selection-focus": selectionFocus ? "" : void 0,
						onBlur: () => {
							setSelectionFocus(false);
						},
						disabled: locked,
						onClick: () => {
							if (open) close(true);
							else show();
						},
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutlineRegular, {
								className: ModelSelect_module_css_default.triggerIcon,
								size: 16
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: ModelSelect_module_css_default.triggerLabel,
								children: currentChoice === void 0 ? modelLabel : renderModelLabel(routeProvider(currentChoice.group, currentChoice.model), currentChoice.model, "trigger", true)
							}),
							effortLabel !== void 0 && (0, react_jsx_runtime.jsx)("span", {
								className: ModelSelect_module_css_default.triggerEffort,
								title: t("menu.effort"),
								onClick: (event) => {
									event.preventDefault();
									event.stopPropagation();
									if (open) close(true);
									else openAt("effort");
								},
								children: effortLabel
							}),
							busy ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: clsx(ModelSelect_module_css_default.chevron, open && ModelSelect_module_css_default.chevronOpen) })
						]
					}),
					open && (0, react_dom.createPortal)((0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
						ref: menuRef,
						id: `${id}-menu`,
						className: ModelSelect_module_css_default.menu,
						style: menuPos ?? MEASURE_STYLE,
						role: pane === "model" ? "group" : "menu",
						"aria-label": t("menu.aria"),
						"aria-busy": state.status === "loading" || busy,
						children: [
							pane === "root" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("button", {
								ref: itemRef(),
								type: "button",
								role: "menuitem",
								className: ModelSelect_module_css_default.cell,
								onClick: () => {
									drill("model");
								},
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellLabel,
										children: t("menu.model")
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellValue,
										children: currentChoice === void 0 ? modelLabel : renderModelLabel(routeProvider(currentChoice.group, currentChoice.model), currentChoice.model, "menu", true)
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { className: ModelSelect_module_css_default.cellChevron })
								]
							}), reasoning !== void 0 && (0, react_jsx_runtime.jsxs)("button", {
								ref: itemRef(),
								type: "button",
								role: "menuitem",
								className: ModelSelect_module_css_default.cell,
								onClick: () => {
									drill("effort");
								},
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellLabel,
										children: t("menu.effort")
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellValue,
										children: effortLabel
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { className: ModelSelect_module_css_default.cellChevron })
								]
							})] }),
							pane === "model" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: ModelSelect_module_css_default.headRow,
									children: [(0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: ModelSelect_module_css_default.backButton,
										"aria-label": t("action.back"),
										onClick: () => { back(pane); },
										children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { style: { transform: "rotate(90deg)" } }), t("action.back")]
									}),
									showSearch && (0, react_jsx_runtime.jsxs)("div", {
										className: ModelSelect_module_css_default.searchRow,
										children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											ref: searchRef,
											className: clsx(ModelSelect_module_css_default.search, query !== "" && ModelSelect_module_css_default.searchWithQuery),
											type: "text",
											role: "searchbox",
											"aria-label": t("search.placeholder"),
											"aria-controls": `${id}-models`,
											"aria-activedescendant": activeModelIndex < 0 ? void 0 : `${id}-model-${activeModelIndex}`,
											placeholder: t("search.placeholder"),
											value: query,
											readOnly: busy,
											onChange: (event) => {
												changeQuery(event.target.value);
											}
										}), query !== "" && (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: ModelSelect_module_css_default.searchClear,
											"aria-label": t("search.clear"),
											disabled: busy,
											onClick: () => {
												changeQuery("");
												searchRef.current?.focus();
											},
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFillRegular, {})
										})]
									})
									]
								}),
								state.status === "loading" && (0, react_jsx_runtime.jsx)("div", {
									className: ModelSelect_module_css_default.status,
									children: t("status.loading")
								}),
								state.error !== null && lastActionRef.current === "load" && (0, react_jsx_runtime.jsxs)("div", {
									className: ModelSelect_module_css_default.error,
									children: [(0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}),
								state.failures.map((failure) => (0, react_jsx_runtime.jsxs)("div", {
									className: ModelSelect_module_css_default.warning,
									children: [(0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", {
										name: failure.id === "deepseek-account" ? t("provider.account") : failure.name,
										message: failure.message
									}) }), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}, failure.id)),
								(0, react_jsx_runtime.jsxs)("div", {
									ref: groupsRef,
									id: `${id}-models`,
									className: clsx(ModelSelect_module_css_default.groups, "scrollable"),
									role: "menu",
									"aria-label": t("menu.model"),
									hidden: filteredGroups.length === 0,
									children: [renderedGroups.map(({ group, entries }, groupIndex) => {
										return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuGroup, {
											label: group === null ? (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: clsx(ModelSelect_module_css_default.groupToggle, groupIndex === 0 && ModelSelect_module_css_default.groupToggleFirst, ModelSelect_module_css_default.groupToggleFavorites),
												"aria-expanded": favoritesExpanded,
												onClick: (event) => {
													const node = event.currentTarget;
													const expand = !favoritesExpanded;
													groupScrollSeq.current += 1;
													groupToggleRef.current = { expand, scrollTop: groupsRef.current?.scrollTop ?? 0 };
													setHighlightedIndex(null);
													setFavoritesCollapsed(!expand);
													if (expand) scrollGroupToTop(node);
												},
												children: [(0, react_jsx_runtime.jsx)("span", {
													className: ModelSelect_module_css_default.groupToggleName,
													children: t("favorites.title")
												}), (0, react_jsx_runtime.jsx)("span", {
													className: ModelSelect_module_css_default.groupToggleStar,
													children: "★"
												}), (0, react_jsx_runtime.jsx)("span", {
													className: ModelSelect_module_css_default.groupToggleCount,
													children: favorites.length
												}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: clsx(ModelSelect_module_css_default.chevron, favoritesExpanded && ModelSelect_module_css_default.chevronOpen) })]
											}) : (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: clsx(ModelSelect_module_css_default.groupToggle, groupIndex === 0 && ModelSelect_module_css_default.groupToggleFirst),
												"aria-expanded": isGroupExpanded(group),
												"aria-label": t(isGroupExpanded(group) ? "group.collapse" : "group.expand", { name: group.provider.name }),
												onClick: (event) => {
													if (searching) return;
													const node = event.currentTarget;
													const expand = !isGroupExpanded(group);
													groupScrollSeq.current += 1;
													groupToggleRef.current = { expand, scrollTop: groupsRef.current?.scrollTop ?? 0 };
													setHighlightedIndex(null);
													setExpandedOverrides((prev) => ({ ...prev, [group.id]: expand }));
													if (expand) scrollGroupToTop(node);
												},
												children: [(0, react_jsx_runtime.jsx)("span", {
													className: ModelSelect_module_css_default.groupToggleName,
													children: group.provider.name
												}), (0, react_jsx_runtime.jsx)("span", {
													className: ModelSelect_module_css_default.groupToggleCount,
													children: group.models.length
												}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: clsx(ModelSelect_module_css_default.chevron, isGroupExpanded(group) && ModelSelect_module_css_default.chevronOpen) })]
											}),
											children: entries.map(({ group, model }) => {
												const index = modelIndex++;
												const route = model.provider ?? group.id;
												const selected = state.current?.provider === route && state.current.model === model.id;
												const favoriteKey = `${route}/${model.id}`;
												const favorite = favorites.includes(favoriteKey);
												return (0, react_jsx_runtime.jsxs)("div", {
													className: ModelSelect_module_css_default.modelRow,
													children: [(0, react_jsx_runtime.jsxs)("button", {
														ref: itemRef(),
														type: "button",
														role: "menuitemradio",
														"aria-checked": selected,
														id: `${id}-model-${index}`,
														tabIndex: showSearch ? -1 : 0,
														onFocus: () => {
															setHighlightedIndex(index);
														},
														"data-highlighted": index === activeModelIndex ? "" : void 0,
														className: clsx(ModelSelect_module_css_default.option, ModelSelect_module_css_default.modelOption, selected && ModelSelect_module_css_default.selected, index === activeModelIndex && ModelSelect_module_css_default.optionActive),
														onMouseMove: busy || index === activeModelIndex ? void 0 : () => {
															if (showSearch) setHighlightedIndex(index);
															else itemRefs.current[index]?.focus();
														},
														title: model.name,
														disabled: busy,
														onClick: () => {
															choose({
																provider: route,
																model: model.id
															});
														},
														children: [(0, react_jsx_runtime.jsx)("span", {
															className: ModelSelect_module_css_default.check,
												"aria-hidden": selected || pending?.provider === route && pending.model === model.id ? void 0 : "true",
															children: pending?.provider === route && pending.model === model.id ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : selected ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {}) : null
														}), (0, react_jsx_runtime.jsx)("span", {
															className: ModelSelect_module_css_default.optionCopy,
															children: (0, react_jsx_runtime.jsx)("span", {
																className: ModelSelect_module_css_default.modelName,
																children: renderModelLabel(routeProvider(group, model), model, "option", selected)
															})
														})]
													}), (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: ModelSelect_module_css_default.favorite,
														tabIndex: -1,
														"aria-pressed": favorite,
														"aria-label": t(favorite ? "favorite.remove" : "favorite.add", { name: model.name }),
														onClick: (event) => {
															event.preventDefault();
															event.stopPropagation();
															toggleFavorite(favoriteKey);
														},
														children: favorite ? "★" : "☆"
													})]
												}, `${route}:${model.id}`);
											})
										}, group === null ? "favorites" : `provider:${group.id}`);
									}), (0, react_jsx_runtime.jsx)("div", {
										ref: spacerRef,
										className: ModelSelect_module_css_default.groupsSpacer,
										"aria-hidden": "true",
										style: { height: spacerHeight }
									})]
								}),
								state.status === "ready" && filteredGroups.length === 0 && (0, react_jsx_runtime.jsx)("div", {
									className: ModelSelect_module_css_default.empty,
									role: "status",
									children: t(choices.length === 0 ? "empty.models" : "search.empty")
								})
							] }),
							pane === "effort" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
								className: ModelSelect_module_css_default.backRow,
								children: (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: ModelSelect_module_css_default.backButton,
									"aria-label": t("action.back"),
									onClick: () => { back(pane); },
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { style: { transform: "rotate(90deg)" } }), t("action.back")]
								})
							}), state.error !== null && lastActionRef.current === "load" && (0, react_jsx_runtime.jsxs)("div", {
								className: ModelSelect_module_css_default.error,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ModelSelect_module_css_default.retry,
									onClick: reload,
									children: t("action.reload")
								})]
							}), effortChoices.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: ModelSelect_module_css_default.empty,
								children: t("empty.efforts")
							}) : effortChoices.map((level) => (0, react_jsx_runtime.jsxs)("button", {
								ref: itemRef(),
								type: "button",
								role: "menuitemradio",
								"aria-checked": effectiveEffort === level.effort,
								className: clsx(ModelSelect_module_css_default.option, effectiveEffort === level.effort && ModelSelect_module_css_default.selected),
								disabled: busy,
								onClick: () => {
									chooseEffort(level.effort);
								},
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: ModelSelect_module_css_default.optionCopy,
									children: (0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.modelName,
										children: level.label
									})
								}), (0, react_jsx_runtime.jsx)("span", {
									className: ModelSelect_module_css_default.check,
									children: pending !== null && pending.provider === state.current?.provider && pending.model === state.current.model && pending.reasoningEffort === level.effort ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }) : effectiveEffort === level.effort ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {}) : null
								})]
							}, level.key))] })
						]
					}), document.body),
					toast !== null && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
						text: toast.text,
						icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutlineRegular, {}),
						anchor: rootRef.current?.closest("[data-composer-card]") ?? null,
						onDone: () => {
							setToast(null);
						}
					}, toast.seq)
				]
			});
		}
		//#endregion
