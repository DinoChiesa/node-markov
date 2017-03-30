// readParagraphs.js
// ------------------------------------------------------------------
//
// reads a stream into paragraphs.
//
// created: Wed Mar 29 16:17:02 2017
// last saved: <2017-March-29 16:53:24>


function readParagraphs(s, cb) {
  var state = 0;
  var accumulator = '';
  var paragraphs = [];

  function readOneChar () {
    var ch;
    while (null !== (ch = s.read(1))) {
      switch (state) {
      case 0:
        if (ch == '\n') {
          state = 1;
        }
        else {
          accumulator += ch;
        }
        break;
      case 1:
        if (ch == '\n') {
          paragraphs.push(accumulator);
          accumulator = '';
          state = 0;
        }
        else {
          state = 0;
          accumulator += ' ';
          accumulator += ch;
        }
        break;
      }
    }
  }

  function finish() {
    if (accumulator) {
      paragraphs.push(accumulator);
      accumulator = '';
    }
    cb(paragraphs);
  }

  s.on('readable', readOneChar);
  s.on('end', finish);
}

module.exports = {
    readParagraphs: readParagraphs
};
