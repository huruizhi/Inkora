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
connection.perform({type: 'open', catalogID: catalog.id, fileID: catalog.files[0].id});
const beforeCancel = messages.length;
process.stdout.write(JSON.stringify({open: messages.at(-1)}) + '\n');
process.stdin.once('data', () => {
  connection.perform({type: 'cancelSearch'});
  if (messages.length !== beforeCancel) throw Error('cancelSearch unexpectedly posted');
  process.stdout.write(JSON.stringify({cancelPosted: false, countBeforeCancel: beforeCancel, countAfterCancel: messages.length}) + '\n');
  process.stdin.destroy();
});
