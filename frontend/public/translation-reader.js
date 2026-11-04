/* Isolated public-prose reader. No app tokens, cookies, or API access. */
(() => {
  let initialized = false;
  let channel;
  const report = document.getElementById('report');
  const send = (state) => parent.postMessage({ type: 'lfb-translation-result', channel, state,
    text: report.textContent, height: Math.ceil(document.body.getBoundingClientRect().height) }, '*');
  addEventListener('message', event => {
    const data = event.data;
    if (initialized || event.source !== parent || !data || data.type !== 'lfb-translate' ||
      typeof data.channel !== 'string' || typeof data.text !== 'string' || data.text.length > 20000) return;
    initialized = true;
    channel = data.channel;
    report.textContent = data.text;
    const style = data.style || {};
    for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'letterSpacing']) {
      if (typeof style[key] === 'string') report.style[key] = style[key];
    }
    new ResizeObserver(() => send('size')).observe(document.body);
    const script = document.createElement('script');
    script.src = 'https://cdn.gtranslate.net/widgets/latest/lib.min.js';
    script.onerror = () => send('error');
    script.onload = () => {
      const translator = window.__GT?.translator;
      if (!translator) return send('error');
      const start = () => {
        translator.resultCallback = () => {
          if (translator.error) send('error');
          else if (translator.finished) { document.documentElement.lang = 'en'; send('translated'); }
        };
        if (!translator.translate('es', 'en')) send('error');
      };
      if (translator.libReady) start();
      else translator.readyCallback = start;
    };
    document.body.appendChild(script);
  });
})();
