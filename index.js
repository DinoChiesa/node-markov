var deck = require('deck');
var Hash = require('hashish');
var readParagraphs = require('./paragraphReader.js').readParagraphs;
var reCharactersToEliminate = new RegExp('[\\]\\[_\\*"\\)\\()]+', 'g');
var reWhitespace = new RegExp("\\s+");
var reEndOfSentence = new RegExp('[\.\!\?]$');
var rePunctuation = new RegExp('[-,;:]$');
var reTrailingSlashes = new RegExp('-+$');

function randomEndOfSentence() {
    var endOfSentence = ".!?";
    return endOfSentence[Math.floor(Math.random() * endOfSentence.length)];
}

function maybeDowncase(txt) {
    var result = (["i", "i'll", "i'm", "i'd"].indexOf(txt.toLowerCase()) >= 0) ?
        capitalize(txt) : txt.toLowerCase();
    return result;
}

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function seemsToBeReadableStream(s) {
    return (typeof s.on === 'function') &&
        (typeof s.read === 'function');
}

module.exports = function (order) {
    if (!order) order = 1;
    var db = {};
    var self = {};

    self.seed = function (seed, cb) {
        if (seemsToBeReadableStream(seed)) {
            readParagraphs(seed, function(paragraphs){
                paragraphs.forEach(function(p){
                    if (p && p.length>1)
                        self.seed(p);
                });
                cb();
            });
        }
        else {
            var i, word, cword, next, cnext;
            var text = (Buffer.isBuffer(seed) ? seed.toString() : seed);
            var words = text.split(reWhitespace)
                .map(function(item) {
                    var output = item
                        .replace(reCharactersToEliminate, '')
                        .replace(reTrailingSlashes, '');
                    //console.log('C[%s]=> %s', item, output);
                    return output;
                });

            var links = [];

            for (i = 0; i < words.length; i += order) {
                var link = words.slice(i, i + order).join(' ');
                //console.log('link[%s]: %s', words[i], JSON.stringify(link));
                links.push(link);
            }

            if (links.length <= 1) {
                if (cb) cb(null);
                return;
            }

            for (i = 1; i < links.length; i++) {
                word = links[i-1].toLowerCase();
                cword = clean(word);
                next = links[i];
                cnext = clean(next);

                //console.log('cword[%s] cnext[%s]', cword, cnext);

                var node = Hash.has(db, cword) ?
                    db[cword] : {
                        count : 0,
                        words : {},
                        next : {},
                        prev : {},
                    }
                ;
                db[cword] = node;

                node.count ++;
                node.words[word] = (
                    Hash.has(node.words, word) ? node.words[word] : 0
                ) + 1;
                node.next[cnext] = (
                    Hash.has(node.next, cnext) ? node.next[cnext] : 0
                ) + 1;
                if (i > 1) {
                    var prev = clean(links[i-2]);
                    node.prev[prev] = (
                        Hash.has(node.prev, prev) ? node.prev[prev] : 0
                    ) + 1;
                }
                else {
                    node.prev[''] = (node.prev[''] || 0) + 1;
                }
            }

            if (!Hash.has(db, cnext)) db[cnext] = {
                count : 1,
                words : {},
                next : { '' : 0 },
                prev : {},
            };
            var n = db[cnext];
            n.words[next] = (Hash.has(n.words, next) ? n.words[next] : 0) + 1;
            n.prev[cword] = (Hash.has(n.prev, cword) ? n.prev[cword] : 0) + 1;
            n.next[''] = (n.next[''] || 0) + 1;

            //console.log(JSON.stringify(db, null, 2));
            if (cb) cb(null);
        }
    };

    self.search = function (text) {
        var words = text.split(/\s+/);

        // find a starting point...
        var start = null;
        var groups = {};
        for (var i = 0; i < words.length; i += order) {
            var word = clean(words.slice(i, i + order).join(' '));
            if (Hash.has(db, word)) groups[word] = db[word].count;
        }

        return deck.pick(groups);
    };

    self.pick = function () {
        return deck.pick(Object.keys(db));
    };

    self.next = function (cur) {
        if (!cur || !db[cur]) return undefined;

        var next = deck.pick(db[cur].next);
        return next && {
            key : next,
            word : deck.pick(db[next].words),
        } || undefined;
    };

    self.prev = function (cur) {
        if (!cur || !db[cur]) return undefined;

        var prev = deck.pick(db[cur].prev);
        return prev && {
            key : prev,
            word : deck.pick(db[prev].words),
        } || undefined;
    };

    self.forward = function (cur, limit) {
        var res = [];
        while (cur && !limit || res.length < limit) {
            var next = self.next(cur);
            if (!next) break;
            cur = next.key;
            res.push(next.word);
        }

        return res;
    };

    self.backward = function (cur, limit) {
        var res = [];
        while (cur && !limit || res.length < limit) {
            var prev = self.prev(cur);
            if (!prev) break;
            cur = prev.key;
            res.unshift(prev.word);
        }

        return res;
    };

    self.fill = function (cur, limit) {
        var dbcur = db[cur];
        //console.log('cur: ' + cur);
        //console.log('dbcur: ' + JSON.stringify(dbcur, null, 2));
        var res = [ deck.pick(db[cur].words) ];
        if (!res[0]) return [];
        if (limit && res.length >= limit) return res;

        var pcur = cur;
        var ncur = cur;

        while (pcur || ncur) {
            //console.log('res: ' + JSON.stringify(res));
            if (pcur) {
                var prev = self.prev(pcur);
                pcur = null;
                if (prev) {
                    pcur = prev.key;
                    res.unshift(prev.word);
                    if (limit && res.length >= limit) break;
                }
            }

            if (ncur) {
                var next = self.next(ncur);
                ncur = null;
                if (next) {
                    ncur = next.key;
                    res.push(next.word);
                    if (limit && res.length >= limit) break;
                }
            }
        }

        return res;
    };

    self.respond = function (text, limit) {
        var cur = self.search(text) || self.pick();
        var line = self.fill(cur, limit);
        //console.log('fill: %s', JSON.stringify(line));
        line = line
            .map(function(value, ix, ar){
                var pair = value.split(reWhitespace);
                return (pair.length>1)?pair[1]:pair[0];
            });

        //return self.sentencify(line);
        return line;
    };

    self.sentencify = function(a) {
        a = a
            .map(function(value, ix, ar){
                var wantCaps = (ix === 0 || ar[ix - 1].match(reEndOfSentence));
                //console.log('needCaps[%s] %s', value, wantCaps);
                return (ix === 0 || ar[ix - 1].match(reEndOfSentence)) ? capitalize(value) : maybeDowncase(value);
            })
            .join(' ');
        while (a.match(rePunctuation)) {
            a = a.slice(0, -1);
        }
        return (a.match(reEndOfSentence)) ? a : a + randomEndOfSentence();
    };

    self.word = function (cur) {
        return db[cur] && deck.pick(db[cur].words);
    };

    return self;
};

function clean (s) {
    return s
        .toLowerCase()
        .replace(reEndOfSentence, '')
        .replace(rePunctuation, '')
        .replace(/[^a-z\d']+/g, ' ')
        .replace(/^_/, '')
        .replace(/_$/, '')
    ;
}
