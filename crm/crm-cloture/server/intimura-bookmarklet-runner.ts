/** Favori court à glisser dans la barre de favoris (charge bookmarklet.js). */
export function buildBookmarkletLoaderHref(apiBase: string, token: string): string {
  const b = JSON.stringify(apiBase);
  const t = JSON.stringify(token);
  return `javascript:(function(){var b=${b};var t=${t};var o=document.getElementById('ci-sync-status');if(o)o.remove();var s=document.createElement('script');s.src=b+'/api/intimura/bookmarklet.js?token='+encodeURIComponent(t);s.onerror=function(){alert('Script sync non charge. Ouvre '+b+'/sync-intimura-install');};document.head.appendChild(s);})();`;
}

import { INTIMURA_SYNC_CUTOFF } from "./intimura-sync-cutoff";

/** Nombre max de lignes lues sur crm.intimura.com/app/quotes par clic favori. */
export const INTIMURA_BOOKMARKLET_MAX_ROWS = 100;

/** Script injecté sur crm.intimura.com (chargé via /api/intimura/bookmarklet.js). */
export function buildIntimuraBookmarkletRunner(apiBase: string, token: string): string {
  const api = JSON.stringify(apiBase);
  const tok = JSON.stringify(token);
  const cutoff = JSON.stringify(INTIMURA_SYNC_CUTOFF);
  const maxRows = String(INTIMURA_BOOKMARKLET_MAX_ROWS);
  return `(function(){
var API_BASE=${api};
var TOKEN=${tok};
var CUTOFF=${cutoff};
var MAX_ROWS=${maxRows};
function parseD(raw){
  if(raw==null)return null;
  var s=String(raw).trim();
  if(!s)return null;
  var iso=s.match(/(\\d{4}-\\d{2}-\\d{2})/);
  if(iso)return iso[1];
  var dmy=s.match(/(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{4})/);
  if(dmy){var dd=dmy[1].length<2?'0'+dmy[1]:dmy[1];var mm=dmy[2].length<2?'0'+dmy[2]:dmy[2];return dmy[3]+'-'+mm+'-'+dd;}
  var t=Date.parse(s);
  return isNaN(t)?null:new Date(t).toISOString().slice(0,10);
}
function rowDate(o){
  var vals=[];
  for(var k in o){if(!Object.prototype.hasOwnProperty.call(o,k))continue;var lk=k.toLowerCase();
    if(/date|created|issued|emis|émise|créé|cree|valid/.test(lk))vals.push(o[k]);}
  for(var i=0;i<vals.length;i++){var d=parseD(vals[i]);if(d)return d;}
  return null;
}
function rowOk(o){var d=rowDate(o);return !!(d&&d>=CUTOFF);}
function status(msg){
  var el=document.getElementById('ci-sync-status');
  if(!el){
    el=document.createElement('div');
    el.id='ci-sync-status';
    el.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647;background:#065f46;color:#fff;padding:14px 18px;border-radius:10px;font:600 14px/1.4 system-ui,sans-serif;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,.35);';
    document.body.appendChild(el);
  }
  el.textContent=msg;
}
function fail(msg){status('Echec: '+msg);alert('Sync Intimura — echec\\n'+msg);}
try{
  status('Demarrage...');
  var path=location.pathname||'';
  var onList=/\\/app\\/quotes\\/?$/.test(path)||(path.indexOf('/app/quotes')===0&&!/\\/quotes\\/[0-9a-f-]{8,}/i.test(path));
  if(!onList){fail('Ouvre la LISTE: crm.intimura.com/app/quotes');return;}
  var rows=[],allIds=[];
  var table=document.querySelector('table')||document.querySelector('[role="table"]');
  if(table){
    var heads=[].slice.call(table.querySelectorAll('thead th, thead td')).map(function(h){return (h.textContent||'').trim().toLowerCase();});
    table.querySelectorAll('tbody tr').forEach(function(tr){
      var tds=tr.querySelectorAll('td');
      if(!tds.length)return;
      var o={};
      tds.forEach(function(td,j){var key=heads[j]||('col'+j);o[key]=(td.textContent||'').trim();});
      var link=tr.querySelector('a[href*="/quotes/"]')||tr.querySelector('a[href]');
      if(link){
        var href=link.getAttribute('href')||'';
        o._href=href;
        var m=href.match(/\\/quotes\\/([0-9a-fA-F-]{8,})/i);
        if(m)o._id=m[1];
      }
      if(o._id&&allIds.indexOf(o._id)<0)allIds.push(o._id);
      rows.push(o);
    });
  }
  if(!allIds.length){
    document.querySelectorAll('a[href*="/quotes/"]').forEach(function(a){
      var href=a.getAttribute('href')||'';
      var m=href.match(/\\/quotes\\/([0-9a-fA-F-]{8,})/i);
      if(m&&allIds.indexOf(m[1])<0){
        allIds.push(m[1]);
        rows.push({_id:m[1],_href:href,titre:(a.textContent||'').trim()});
      }
    });
  }
  var before=rows.length;
  rows=rows.filter(rowOk);
  allIds=[];
  rows.forEach(function(o){if(o._id&&allIds.indexOf(o._id)<0)allIds.push(o._id);});
  var skippedOld=before-rows.length;
  if(!rows.length){fail(skippedOld?'Aucune soumission du '+CUTOFF+' ou apres sur cette page.':'Aucune soumission trouvee.');return;}
  if(rows.length>MAX_ROWS){fail('Max '+MAX_ROWS+' lignes. Filtre la liste.');return;}
  status('Envoi '+rows.length+' ligne(s) (>= '+CUTOFF+')...');
  var ingestUrl=API_BASE+'/api/intimura/ingest?token='+encodeURIComponent(TOKEN);
  var detailsUrl=API_BASE+'/api/intimura/ingest-details?token='+encodeURIComponent(TOKEN);
  fetch(ingestUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:rows})})
  .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||j.error||('HTTP '+r.status));return j;});})
  .then(function(summary){
    var ids=allIds.slice(),items=[],i=0;
    function next(){
      if(i>=ids.length){
        status(ids.length?'Import fiches '+items.length+'/'+ids.length+'...':'Finalisation...');
        if(!items.length)return {summary:summary,details:{updated:0,results:[]}};
        return fetch(detailsUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items})})
          .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.message||j.error||('HTTP '+r.status));return {summary:summary,details:j};});});
      }
      var id=ids[i++],n=i;
      status('Fiche '+n+'/'+ids.length+'...');
      return fetch(location.origin+'/app/quotes/'+id+'/__data.json?x-sveltekit-invalidated=001',{credentials:'include'})
        .then(function(r){return r.ok?r.json():null;})
        .then(function(p){
          if(p){
            var node=(p.nodes||[]).find(function(x){return x&&x.type==='data';});
            if(node&&node.data)items.push({intimuraId:id,svelteData:node.data});
          }
        }).catch(function(){}).then(next);
    }
    return next();
  })
  .then(function(res){
    var s=res.summary||{},d=res.details||{};
    var du=(d.updated!=null?d.updated:(d.results||[]).filter(function(x){return x.ok;}).length);
    var skip=(d.results||[]).filter(function(x){return x.reason==='ALREADY_SYNCED';}).length;
    status('Termine! '+du+' fiche(s) importee(s).');
    var oldN=(s.skippedBeforeCutoff||0)+skippedOld;
    alert('Sync terminee\\n'+(s.createdLeads||0)+' nouveau(x) lead(s)\\n'+(s.createdQuotes||0)+' soumission(s)\\n'+du+' fiche(s) complete(s)\\n'+skip+' deja a jour\\n'+(s.skipped||0)+' deja dans le CRM\\n'+oldN+' avant '+CUTOFF+' (non transferees)');
    window.open(API_BASE+'/#/soumissions','_blank');
  })
  .catch(function(e){fail(e&&e.message?e.message:String(e));});
}catch(e){fail(e&&e.message?e.message:String(e));}
})();`;
}
