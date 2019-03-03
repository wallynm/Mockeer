const parse = require('url-parse');
const isImage = require('is-image');
const path = require('path');
const fs = require('fs');
const { svgContentTypeHeader, svgContentLength } = require('../utils/svg-template');
const { removeLastDirectoryPartOfUrl } = require('./url-helper');

const removeDuplicates = (outputs) => {
  const obj = {};
  return Object.keys(outputs.reduce((prev, next) => {
    if (!obj[next.url]) obj[next.url] = next;
    return obj;
  }, obj)).map(i => obj[i]);
};

const getBrowserPages = async browser => browser.pages();

const handleRecordMode = async ({
  browser, config,
}) => {
  const scopes = [];
  const setRequestInterceptor = p => p.on('response', async (response) => {
    if (response.ok()) {
      const scope = {};
      const parsedUrl = parse(response.url(), true);
      scope.url = response.url();
      scope.fullPath = `${parsedUrl.origin}${parsedUrl.pathname}`;
      scope.minimalPath = removeLastDirectoryPartOfUrl(scope.fullPath);
      scope.query = parsedUrl.query;
      scope.headers = response.headers();
      scope.status = response.status();
      scope.method = response.request().method();
      let isImg;
      try { isImg = isImage(scope); } catch (e) { /* do nothing */ }
      if (!isImg) {
        scope.body = await response.text();
        scopes.push(scope);
        return scopes;
      }
      if (isImg && config.replaceImage && path.extname(scope.url) !== '.svg') {
        scope.body = config.svgTemplate;
        scope.headers['content-type'] = svgContentTypeHeader;
        scope.headers['content-length'] = svgContentLength;
        return scopes.push(scope);
      }
    }
    return null;
  });
  let fixtureSaved = false;
  const saveScopes = () => {
    fixtureSaved = true;
    const reducedOutput = removeDuplicates(scopes);
    fs.appendFileSync(config.fixtureFilePath, JSON.stringify(reducedOutput));
  };
  if (config.page) {
    setRequestInterceptor(config.page);
    config.page.on('close', () => {
      if (!fixtureSaved) { saveScopes(); }
    });
  } else {
    const pages = await getBrowserPages(browser);
    pages.forEach(p => setRequestInterceptor(p));
  }

  browser.on('disconnected', () => {
    if (!fixtureSaved) { saveScopes(); }
  });
};

module.exports = handleRecordMode;
