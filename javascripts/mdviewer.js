_.templateSettings = {interpolate: /{{(.+?)}}/g, escape: /{{-(.+?)}}/g};

CONTEXT = {
    csvw: 'http://www.w3.org/ns/csvw#',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    dc: 'http://purl.org/dc/terms/',
    dcat: 'http://www.w3.org/ns/dcat#',
    prov: 'http://www.w3.org/ns/prov#'
};

function escape(s) {
    return _.template('{{-s}}')({s: s})
}

function e(tag, attrs, content) {
    var attr_string = '',
        content_string = '';
    for (attr in attrs) {
        if (attrs.hasOwnProperty(attr)) {
            attr_string += _.template(' {{k}}="{{v}}"')({k: attr, v: attrs[attr]})
        }
    }
    content = (typeof content !== 'undefined') ? content : [];
    content = (typeof content.match !== 'undefined') ? [content] : content;
    for (var i = 0; i < content.length; i++) {
        content_string += ' ' + content[i];
    }
    return _.template('<{{tag}}{{attrs}}>{{content}}</{{tag}}>')({
        tag: tag,
        attrs: attr_string,
        content: content_string
    })
}

function link(url, label, attrs) {
    attrs = (typeof attrs !== 'undefined') ? attrs : {};
    attrs['href'] = url;
    return e('a', attrs, [escape(label)])
}

function term(t) {
    return link(t, t.split('#')[1], {title: 'CLDF Ontology term ' + t})
}

function qname(prefix, lname) {
    return link(CONTEXT[prefix] + lname, lname, {title: prefix + ':' + lname})
}

function fname(fn) {
    return e('span', {class: 'fname'}, fn)
}

function module(cldf, fn) {
    return e('h3', {}, [term(cldf['dc:conformsTo']), 'at', fname(fn)])
}

function stringify(o) {
    var content;
    if (typeof o === 'object' && o !== null) {
        content = '';
        for (prop in o) {
            if (o.hasOwnProperty(prop)) {
                content += e('tr', {}, e('th', {'style': 'text-align: right; font-weight: bold;'}, prop) + e('td', {}, stringify(o[prop])));
            }
        }
        return e('table', {}, content);
    } else if (typeof o.match === 'undefined') {
        return JSON.stringify(o, null, 2);
    }
    return o;
}

function common_properties(cldf) {
    var prefix,
        lname,
        value,
        res = [],
        agg = [];
    for (prop in cldf) {
        if (cldf.hasOwnProperty(prop) && prop !== 'dc:conformsTo') {
            if (prop.search(':') > -1) {
                prefix = prop.split(':')[0];
                lname = prop.split(':')[1];
                if (prop === 'dc:source') {
                    value = fname(cldf[prop]);
                } else {
                    if (Array.isArray(cldf[prop])) {
                        agg = [];
                        cldf[prop].forEach(function(v) {agg.push(e('li', {}, stringify(v)))});
                        value = e('ul', {class: 'value_list'}, agg);
                    } else {
                        value = stringify(cldf[prop]);
                    }
                }
                if (prefix in CONTEXT) {
                    res.push(e('dt', {}, qname(prefix, lname)));
                    res.push(e('dd', {}, value));
                }
            }
        }
    }
    return e('dl', {class: 'common_properties'}, res);
}

function column(c, t, pks, fks, table_names) {
    var res = [],
        label = c.name;
    if (c.propertyUrl) {
        label = link(c.propertyUrl, c.name)
    }
    res.push(e('strong', {}, label));
    if (fks[c.name]) {
        res.push(escape(' -> '));
        res.push(link('#col-' + fks[c.name][0] + '-' + fks[c.name][1], table_names[fks[c.name][0]]));
    }
    if (c['dc:description']) {
        res.push(':')
        res.push(e('emph', {}, c['dc:description']));
    }
    return res.join('\n');
}

function table(t, table_names) {
    var res = [],
        agg = [],
        pks = [],
        fks = {};
    if (typeof t.tableSchema.primaryKey !== 'undefined') {
        pks = t.tableSchema.primaryKey;
        if (typeof t.tableSchema.primaryKey.match !== 'undefined') {
            pks = [pks];
        }
    }
    if (typeof t.tableSchema.foreignKeys !== 'undefined') {
        t.tableSchema.foreignKeys.forEach(function (fk) {
            var crs = fk.columnReference,
                refcr = fk.reference.columnReference;
            if (typeof fk.columnReference.match !== 'undefined') {
                crs = [fk.columnReference]
            }
            if (typeof fk.reference.columnReference.join !== 'undefined') {
                refcr = fk.reference.columnReference[0];
            }
            crs.forEach(function (cr) {
                fks[cr] = [fk.reference.resource, refcr];
            })
        });
    }
    if (t['dc:conformsTo']) {
        agg = [e('span', {id: table_names[t.url]}, 'Component'), term(t['dc:conformsTo'])];
    } else {
        agg = [e('span', {id: table_names[t.url]}, 'Table')];
    }
    agg.push('at');
    agg.push(fname(t['url']));
    res.push(e('h5', {}, agg));
    agg = [];
    t.tableSchema.columns.forEach(function (col) {
        agg.push(e('li', {
            id: 'col-' + t.url + '-' + col.name,
            class: 'column'
        }, column(col, t, pks, fks, table_names)));
    });
    res.push(e('ul', {}, agg));
    return res.join('\n')
}

function metadata(md, f) {
    var table_names = {},
        html = [
            module(md, f.name),
            common_properties(md),
            e('h4', {}, 'Components and Tables')];
    md['tables'].forEach(function (t) {
        if (t['dc:conformsTo']) {
            table_names[t.url] = t['dc:conformsTo'].split('#')[1];
        } else {
            table_names[t.url] = t.url;
        }
    });
    md['tables'].forEach(function (t) {
        html.push(table(t, table_names));
    });
    return html.join('\n')
}

function handleFileSelect(evt) {
    var reader = new FileReader();
    reader.onload = (function (f) {
        return function (e_) {
            $('#metadata').html(metadata(JSON.parse(e_.target.result), f));
        };
    })(evt.target.files[0]);
    reader.readAsText(evt.target.files[0]);
}

$(document).ready(function () {
    if (window.File && window.FileReader) {
        // Great success! All the File APIs are supported.
    } else {
        alert('The File APIs are not fully supported in this browser.');
    }
    $('#file').on("change", handleFileSelect);
});
