const fs = require('fs');
const {SidebarConnection} = require('./compiled/sidebar-connection.js');
const native = JSON.parse(fs.readFileSync(__dirname + '/native.json', 'utf8'));
const messages = [];
const connection = new SidebarConnection({
  binding: () => ({documentID: 'document', revision: 0}),
  send: serialized => {messages.push(JSON.parse(serialized)); return true;},
  catalog: () => {}, result: () => {}, error: message => {throw Error(message);}
});
connection.connect();
const readyID = messages[0].requestID;
for (const reply of native) connection.receive(JSON.stringify({...reply, requestID: readyID}));
const catalog = native.find(reply => reply.kind === 'catalog').catalog;
connection.perform({type: 'search', catalogID: catalog.id, query: 'alpha', options: {caseSensitive: false, wholeWord: false, regularExpression: false}});
const search = messages.at(-1);
process.stdout.write(JSON.stringify({search}) + '\n');
process.stdin.once('data', data => {
  const reply = JSON.parse(data.toString());
  connection.receive(JSON.stringify(reply));
  const hit = reply.result.hits[0];
  connection.perform({type: 'open', catalogID: catalog.id, fileID: hit.fileID, hitID: hit.hitID});
  const open = messages.at(-1);
  process.stdout.write(JSON.stringify({open}) + '\n');
  process.stdin.once('data', () => {
    const beforeCancel = messages.length;
    connection.perform({type: 'cancelSearch'});
    const cancel = messages.at(-1);
    if (messages.length !== beforeCancel + 1 || cancel.action !== 'cancelSearch' ||
      cancel.targetSearchRequestID !== search.requestID || cancel.targetOpenRequestID !== open.requestID) {
      throw Error('cancellation must target pending open and completed search');
    }
    process.stdout.write(JSON.stringify({cancel, countBeforeCancel: beforeCancel, countAfterCancel: messages.length}) + '\n');
    process.stdin.destroy();
  });
});
