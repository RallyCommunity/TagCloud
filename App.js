Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: 'border',
    items: [
	{
	    title: 'Tag Cloud',
	    xtype: 'panel',
	    itemId: 'cloud',
	    region: 'west',
	    width: '30%',
	    collapsible: true,
	    bodyStyle: 'padding:15px',
	    listeners: { 'afterRender': function(el) { setTimeout(function() { el.setLoading(); }, 500);}} // needs a little delay
	},
	{
	    title: '<<< Select a tag from the Tag Cloud',
	    xtype: 'panel',
	    itemId: 'grid',
	    region: 'center',
	    width: '70%',
	    collapsible: false
	}
    ],

    tagMap : [],
    maxFont : 24, // largest desired font size
    minFont : 8,  // and smallest

    _renderTag : function renderHandler(tagLabel) {
	tagLabel.getEl().on('click',this._tagSelected, this);
    },
    
    // does the actual building of the cloud from 'tagMap'
    _buildCloud: function(app, response) {
	var i, tag;
	for (i=0;i<response.Results.length;i++) {
	    tag = response.Results[i];

	    if(typeof app.tagMap[tag.ObjectID] !== "undefined") {
		app.tagMap[tag.ObjectID].Name = tag._refObjectName;
	    }
	}
	if(response.StartIndex+response.PageSize < response.TotalResultCount) {
	    app._queryForTagNames(response.StartIndex+response.PageSize, app, app._buildCloud);
	} else {
            var len = 0, key;
            for (key in app.tagMap) {
                 if (app.tagMap.hasOwnProperty(key)) len++;
            }
            if(len === 0) {
		tag = new Ext.form.Label({
			id: 'tagNone',
			text: '  No tagged Stories found  '
		    });
		    app.down('#cloud').add(tag);
	    } else {
		var minFrequency = Number.MAX_VALUE;
		var maxFrequency = Number.MIN_VALUE;
		var tuples = [];
		for (var x in app.tagMap) {
		    if (app.tagMap.hasOwnProperty(x)) {
			tuples.push([x, app.tagMap[x]]);
			if(app.tagMap[x].count > maxFrequency) {
			    maxFrequency = app.tagMap[x].count;
			}
			if(app.tagMap[x].count < minFrequency) {
			    minFrequency = app.tagMap[x].count;
			}
		    }
		}
    
		tuples.sort(function(a,b) { a = a[1]; b = b[1]; return a.Name > b.Name ? 1 : a.Name < b.Name ? -1 : 0 ;});
				
		for (i = 0; i < tuples.length; i++) {
		    var ftsize = ((tuples[i][1].count-minFrequency)*(app.maxFont-app.minFont) / (maxFrequency-minFrequency)) + app.minFont;
		    tag = new Ext.form.Label({
			id: 'tag'+tuples[i][0],
			text: '  ' + tuples[i][1].Name + '  ',
			overCls: 'link',
			style:"font-size: "+ftsize+"pt;",
			listeners: { scope: app, render: app._renderTag }
		    });
		    app.down('#cloud').add(tag);
		}
	    }
	    app.getComponent('cloud').setLoading(false);
	}
    },
    
    // collects the _queryForTags responses and calls _queryForTagNames when it has them all
    _buildTagMap: function(app, response)  {
	for (var i=0;i<response.Results.length;i++) {
	    var ent = response.Results[i];
	    for (var j=0; j < ent.Tags.length; j++) {
		var tag = ent.Tags[j];
		var mapent = app.tagMap[tag];
		if(typeof mapent === "undefined") {
		    mapent = { count: 1 };
		} else {
		    mapent.count++;
		}
		app.tagMap[tag] = mapent;
	    }
	}
	if(response.StartIndex+response.PageSize < response.TotalResultCount) {
	    app._queryForTags(response.StartIndex+response.PageSize, app, app._buildTagMap);
	} else {
	    app._queryForTagNames(0, app, app._buildCloud);
	}
    },

    // get a list of the tags from the Lookback API, iterating if necessary (see _buildTagMap)
    _queryForTags: function(start, app, callback) {
	var params = {
	    find: "{'Tags':{'$exists':true}, '__At':'current', '_TypeHierarchy':-51038, '_ProjectHierarchy':"+ this.getContext().getProject().ObjectID +" }",
	    fields: "['Tags']",
	    pagesize: 20000,
	    start: start
	};
	Ext.Ajax.request({
	    url: 'https://rally1.rallydev.com/analytics/v2.0/service/rally/workspace/'+ this.context.getWorkspace().ObjectID + '/artifact/snapshot/query.js',
	    method: 'GET',
	    params: params,
	    withCredentials: true,
	    success: function(response){
		var text = response.responseText;
		var json = Ext.JSON.decode(text);
		callback(app, json);
	    }
	});
    },

    // once all the tags have been collected, get a list of the tag names from the WSAPI, iterating if necessary (see _buildCloud)
    _queryForTagNames: function(start, app, callback) {
	Ext.Ajax.request({
	    url: 'https://rally1.rallydev.com/slm/webservice/1.32/tag.js',
	    method: 'GET',
	    params: { fetch: "ObjectID", pagesize: 200, "start": start},
	    withCredentials: true,
	    success: function(response){
		callback(app, Ext.JSON.decode(response.responseText).QueryResult);
	    }
	});
    },

    _queryForStories: function(tagOid) {
		Rally.data.ModelFactory.getModel({
			type: 'UserStory',
			success: function(model) {
				this.down('#grid').removeAll();
				this.grid = this.down('#grid').add({
					xtype: 'rallygrid',
					model: model,
					multiSelect: true,
					columnCfgs: [
						'FormattedID',
						'Name',
						'Owner'
					],
					storeConfig: {
					    filters: [
						{
						property:'Tags',
						operator: '=',
						value: "tag/" + tagOid
						}
					    ],
					    listeners: {
                         			 load: this._loaded,
						 scope: this
                     		    }
					}
				});
			},
			scope: this
		});
    },
	_loaded: function() {
		this.getComponent('grid').setLoading(false);
		this.getComponent('grid').setTitle('Stories tagged: ' + this.tagName);
	},
    
    _tagSelected: function(app, elem) {
		this.getComponent('grid').setLoading();
		this._queryForStories(elem.id.substring(3)); // cheesy, id is "tag"+tagOid, we need the oid
		this.tagName = elem.innerText;
    },
    
    launch: function() {
	this._queryForTags(0, this, this._buildTagMap);
    }
});
