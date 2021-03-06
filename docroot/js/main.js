AUI.add('sql-editor', function (Y) {

	var EMPTY_STR = '',
		PORTLET_ID = 'sqleditor_WAR_sqleditorportlet',
		_sqlProcessor = new Y.AceEditor.AutoCompleteSQL();

	/**
	 *  SQL Editor widget
	 */
	Y.SQLEditor = Y.Base.create('sql-editor', Y.Widget, [], {

		initializer: function(config) {
			var instance = this;

			var tables = instance.get('tables');

			var tablesTree = new Y.TreeView({
				srcNode: '.sql-editor .tree',
				children: [
					{
						children: tables,
						expanded: true,
						label: 'Portal tables ('+ tables.length +')'
					}
				],
				type: 'file'
			});

			instance.set('tablesTree', tablesTree);

			var aceEditor = new Y.AceEditor({
				boundingBox: '.sql-editor .sql-box',
				value: 'SELECT \n\t\t*\n\tFROM\n\t\tCountry;',
				width: '100%',
				mode: 'sql',
				height: '100%',
				plugins: [{
					fn: Y.Plugin.AceAutoComplete,
					cfg: {
						processor: _sqlProcessor,
						render: true,
						visible: false,
						zIndex: 1000
					}
				}]
			});

			_sqlProcessor.set('schema', tables);

			aceEditor.getEditor().setFontSize(instance.get('fontSize'));

			aceEditor.getEditor().setTheme('ace/theme/textmate');

			instance.set('aceEditor', aceEditor);

			var paginator = new Y.Pagination(
				{
					after: {
						changeRequest: function(event) {
							var start = (event.state.page-1) * instance.get('pageSize');
							var sql = instance.get('latestQuery');

							instance._executeQuery(sql, start, instance.get('pageSize'));
						}
					},
					boundingBox: '.paginator',
					offset: 1,
					page: 0,
					strings: {
						next: '»',
						prev: '«'
					}
				}
			);

			instance.set('paginator', paginator);
		},

		bindUI: function() {
			var instance = this;

			var aceEditor = instance.get('aceEditor');

			aceEditor.getEditor().commands.addCommand({
				name: 'executeScript',
				bindKey: {
					win: 'Ctrl-Enter',
					mac: 'Command-Enter',
					sender: 'editor|cli'
				},
				exec: function(env, args, request) {
					var sql = aceEditor.get('value');
					instance._executeQuery(sql);
				}
			});

			var executeQueryButton = Y.one('.sql-editor .execute-query');

			executeQueryButton.on('click', function () {
				var sql = instance.get('aceEditor').get('value');
				instance._executeQuery(sql);
			});

			var loadSnippetButton = Y.one('.sql-editor .load-snippet');

			loadSnippetButton.on('click', function () {
				instance._openLoadSnippetDialog();
			});

			var saveSnippetButton = Y.one('.sql-editor .save-snippet');

			saveSnippetButton.on('click', function () {
				var sql = instance.get('aceEditor').get('value');

				instance._openSaveSnippetDialog(sql);
			});

			var exportCSVButton = Y.one('.sql-editor .export-csv');

			exportCSVButton.on('click', function () {
				var sql = instance.get('latestQuery');

				instance._exportCSV(sql);
			});

			var filterInput = Y.one('.sql-editor .input-search-table');

			filterInput.on('keyup', function (e) {
				instance.filterObjectTree(e.currentTarget.val());
			});

			var filterResults = Y.one('.sql-editor .input-filter-results');

			if (filterResults) {
				filterResults.on('keyup', function (e) {
					instance.filterResults(e.currentTarget.val());
				});
			}

			var expandFieldsCheckbox = Y.one('.sql-editor .expand-fields');

			expandFieldsCheckbox.on('click', function (e) {
				var checked = e.currentTarget.get('checked');

                var filterValue = Y.one('.sql-editor .input-filter-results').val();

                if (checked) {
					Y.one('.results .results-dt').removeClass('collapsed');
				}
				else {
					Y.one('.results .results-dt').addClass('collapsed');
				}

                instance.filterResults(filterValue);
            });

			Y.on('windowresize', instance._adjustSize);
		},

		renderUI: function() {
			var instance = this;

			instance.get('tablesTree').render();
			instance.get('aceEditor').render();

			instance._adjustSize();
			Y.one('.sql-editor .export-csv').set('disabled', true);

			Y.one('.sql-editor').show();
		},

		_executeQuery: function(sql, start, length) {
			var instance = this;

			var url = instance.get('executeQueryActionURL');

			if (instance.get('blocked') === true) {
				return;
			}

			instance.set('latestQuery', sql);
			Y.one('.sql-editor .export-csv').set('disabled', false);

			Y.one('.sql-editor .execute-query').set('disabled', true);
			instance.set('blocked', true);

			Y.io.request(url, {
				data: {
					query: sql,
					start: start,
					length: length
				},
				on:	{
					success : function (id,res) {
						var data = JSON.parse(this.get('responseData'));

						var rs = data.results;
						instance.set('resultSet', rs);

						var numElements = data.numElements;
						var paginated = data.paginated;

						instance._showResults(rs, paginated, numElements);
					},
					complete : function() {
						instance.set('blocked', false);

						Y.one('.sql-editor .execute-query').set(
							'disabled', false);
					}
				}
			});
		},

		_exportCSV: function(sql) {
			var instance = this;

			var resourceURL= Liferay.PortletURL.createResourceURL();
			resourceURL.setParameter("query", sql);
			resourceURL.setResourceId("exportCSV");
			resourceURL.setPortletId(PORTLET_ID);

			window.location.href = resourceURL.toString();
		},

		filterObjectTree: function(filter) {
			var instance = this;

			var tables = instance.get('tables');

			for(var i in tables) {
				var label = tables[i].label.toLowerCase();
				var tableId = tables[i].id;

				if (label.indexOf(filter.toLowerCase()) != -1) {
					Y.one('#' + tableId).show();
				}
				else {
					Y.one('#' + tableId).hide();
				}
			}
		},

		filterResults : function(filter) {
			var instance = this;

			var totalResultSet = instance.get('resultSet');

			var filteredSet = [];

			if (filter.length == 0) {
				filteredSet = totalResultSet;
			}
			else {
				for ( var i in totalResultSet) {
					for ( var j in totalResultSet[i]) {
						if (totalResultSet[i][j].toLowerCase().indexOf(filter.toLowerCase()) != -1) {
							filteredSet.push(totalResultSet[i]);
							break;
						}
					}
				}
			}

			instance._showResults(filteredSet, false);
		},

		_openLoadSnippetDialog : function() {
			var instance = this;

			var renderURL = Liferay.PortletURL.createRenderURL();
			renderURL.setParameter("jspPage", "/pages/load-snippet.jsp");
			renderURL.setWindowState("pop_up");
			renderURL.setPortletId(PORTLET_ID);

			Liferay.Util.openWindow(
				{
					dialog: {
						width: 'auto',
						height: 'auto'
					},
					id: '<portlet:namespace />LoadSnippetDialog',
					title: 'Load snippet',
					uri: renderURL.toString()
				}
			);
		},

		_openSaveSnippetDialog : function(sql) {
			var instance = this;

			var renderURL = Liferay.PortletURL.createRenderURL();
			renderURL.setParameter("query", sql);
			renderURL.setParameter("jspPage", "/pages/save-snippet.jsp");
			renderURL.setWindowState("pop_up");
			renderURL.setPortletId(PORTLET_ID);

			Liferay.Util.openWindow(
				{
					dialog: {
						width: 820,
						height: 'auto'
					},
					id: '<portlet:namespace />SaveSnippetDialog',
					title: 'Save sql as snippet',
					uri: renderURL.toString()
				}
			);

		},

		_showResults : function(rs, paginated, numElements) {

			var instance = this;

			var resultDT = instance.get('resultDT');

			if(resultDT) {
				resultDT.hide();
				Y.one('.sql-editor .results .results-dt').html(EMPTY_STR);
			}

			resultDT = new Y.DataTable(
				{
					scrollable: "xy",
					width: '100%',
					height: '100%',
					destroyOnHide:true
				}
			);

			instance.set('resultDT', resultDT);

			if (rs[0]) {
				var currentColumnSet = Object.keys(rs[0]);

				resultDT.set('columnset', currentColumnSet);
				resultDT.set('recordset', rs);
			}

			var resultsDiv = Y.one('.sql-editor .results');

			resultsDiv.show();

			resultDT.render('.results-dt');


			var aceDiv = Y.one('.sql-editor .sql-box');

			resultsDiv.setStyle('height', 'auto');

			var resultsSize = resultsDiv.get('offsetHeight');

			aceDiv.setStyle('bottom', resultsSize);
			aceDiv.setStyle('height', 'auto');

			instance.get('aceEditor').getEditor().resize();

			if (paginated === true) {
				instance.get('paginator').set('total',(numElements / instance.get('pageSize')) + 1);
				instance.get('paginator').render();
			}
		},

		_adjustSize : function() {
			var instance = this;

			var winHeight = Y.one("body").get("winHeight");

			Y.one('.objects-tree').setStyle('height', winHeight -260);

			Y.one('.editor').setStyle('height', winHeight -260);

			Y.one('.sql-box').setStyle('height', winHeight -260);

			var resultsDiv = Y.one('.sql-editor .results');

			var aceDiv = Y.one('.sql-editor .sql-box');

			resultsDiv.setStyle('height', 'auto');

			var resultsSize = resultsDiv.get('offsetHeight');

			aceDiv.setStyle('bottom', resultsSize);
			aceDiv.setStyle('height', 'auto');

			instance.get('aceEditor').getEditor().resize();
		}

	},{
		ATTRS: {
			blocked: {
				value: false
			},
			editor: {
				value: undefined
			},
			tables: {
				value: undefined
			},
			tablesTree: {
				value: undefined
			},
			aceEditor: {
				value: undefined
			},
			resultDT: {
				value: undefined
			},
			paginator: {
				value: undefined
			},
			executeQueryActionURL: {
				value: undefined
			},
			latestQuery : {
				value: undefined
			},
			pageSize: {
				value: 10
			},
			fontSize: {
				value: undefined
			},
			resultSet: {
				value: undefined
			}
		}
	});


},'0.0.1', {
	requires:
		['base','event','aui-tree-view','aui-ace-editor','io','aui-datatable','aui-pagination','aui-ace-autocomplete-plugin','sql-autocomplete','liferay-portlet-url','aui-dialog'] }
);
