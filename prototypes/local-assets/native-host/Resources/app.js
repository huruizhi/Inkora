(() => {
  'use strict';
  const image = document.getElementById('fixture-image');
  const imageState = document.getElementById('image-state');
  const documentState = document.getElementById('document');
  const epochState = document.getElementById('epoch');
  const events = document.getElementById('events');

  window.showImage = (tokenURL, documentID, epoch) => {
    documentState.textContent = documentID;
    epochState.textContent = epoch;
    imageState.textContent = 'broker 请求中';
    image.onload = () => { imageState.textContent = 'WK 已完成图片加载'; };
    image.onerror = () => { imageState.textContent = 'WK 加载被拒绝或失败（查看事件）'; };
    image.src = tokenURL;
  };

  window.clearImage = (reason) => {
    image.removeAttribute('src');
    imageState.textContent = reason;
  };

  window.appendEvent = (line) => {
    const all = (events.textContent + line + '\n').split('\n');
    events.textContent = all.slice(Math.max(0, all.length - 31)).join('\n');
  };
})();
