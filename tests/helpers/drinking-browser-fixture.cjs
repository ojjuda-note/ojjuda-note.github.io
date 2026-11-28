'use strict';

// Real browser/source/SQL, isolated Auth and HTTP transport. No request can
// reach a production account, service or database from this fixture.
const fs = require('node:fs');
const path = require('node:path');
const {rpcArgs, root} = require('./drinking-ui-fixture.cjs');

const origin = 'https://drinking-fixture.test';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json',
  '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};

function configSource(actor) {
  return `(() => {
    const actor = ${JSON.stringify(actor)};
    const user = {id: actor, is_anonymous: false};
    const listeners = new Set();
    const client = {
      auth: {
        getSession: async () => ({data:{session:{user}},error:null}),
        getUser: async () => navigator.onLine
          ? ({data:{user},error:null})
          : ({data:{user:null},error:{name:'AuthRetryableFetchError',status:0}}),
        onAuthStateChange(listener) {
          listeners.add(listener);
          return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};
        }
      },
      rpc(name,args) {
        let request;
        function execute(signal) {
          if (request) return request;
          request = new Promise((resolve,reject) => {
            if (!navigator.onLine) {resolve({data:null,error:{message:'Failed to fetch'}});return;}
            const cancel = () => reject(new DOMException('Aborted','AbortError'));
            if (signal?.aborted) {cancel();return;}
            signal?.addEventListener('abort',cancel,{once:true});
            window.__fixtureRpc({name,args:args||{}}).then(resolve,reject)
              .finally(()=>signal?.removeEventListener('abort',cancel));
          });
          return request;
        }
        return {abortSignal:execute,then:(yes,no)=>execute().then(yes,no)};
      }
    };
    window.OjjudaGetClient = async () => client;
  })();`;
}

async function browserSession(browser, {db, actor, viewport = {width:390,height:844},
  reducedMotion = 'reduce', rpc, errors = [], localPlayers} = {}) {
  const context = await browser.newContext({viewport, reducedMotion});
  const calls = [];
  if (localPlayers) await context.addInitScript(({actor,players}) => {
    localStorage.setItem('oj.party.' + actor + '.players', JSON.stringify(players));
  }, {actor,players:localPlayers});
  await context.exposeBinding('__fixtureRpc', async (_source, {name,args}) => {
    calls.push({name,args});
    if (name === 'get_my_member_identity') return {data:{age:25,locked:true},error:null};
    try {
      const data = rpc ? await rpc(name,args) : await db.publicRpc(actor,name,rpcArgs(name,args));
      return {data,error:null};
    } catch (error) {return {data:null,error:{message:error.message}};}
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {await route.abort();return;}
    if (url.pathname === '/config.js') {
      await route.fulfill({status:200,contentType:mime['.js'],body:configSource(actor)});return;
    }
    const relative = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(root + path.sep)) {await route.fulfill({status:403,body:''});return;}
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      await route.fulfill({status:204,body:''});return;
    }
    await route.fulfill({status:200,contentType:mime[path.extname(filename)] || 'application/octet-stream',body:fs.readFileSync(filename)});
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  return {context,page,actor,calls,errors};
}

async function dismissGuide(page) {
  const guide = page.locator('[data-drinking-dialog="guide"]');
  await guide.waitFor({state:'visible'});
  await guide.locator('[data-drinking-close]').first().click();
  await guide.waitFor({state:'hidden'});
}

module.exports = {browserSession, dismissGuide, origin};
