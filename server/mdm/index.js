/**
 * ### Обрабатывает запросы /mdm/
 * Возвращает обрезанную ram
 *
 * @module get
 *
 * Created by Evgeniy Malyarov on 05.02.2019.
 */

const {end404, end500} = require('../http/end');
const fs = require('fs');
const {resolve} = require('path');
const merge2 = require('merge2');
const check_mdm = require('./check_mdm');
const load_predefined = require('./load_predefined');
const manifest = require('./manifest');
const prices = require('./prices');

// эти режем по отделу
const by_branch = [
  'cat.partners',
  'cat.contracts',
  'cat.branches',
  'cat.divisions',
  'cat.users',
  'cat.individuals',
  'cat.organizations',
];
// эти общие - их не режем и грузим сразу
const common = [
  'cch.properties',
  'cat.property_values',
  'cat.contact_information_kinds',
  'cat.clrs',
  'cat.elm_visualization',
  'cat.units',
  'cat.countries',
  'cat.currencies',
  'cat.scheme_settings',
  'cat.meta_ids',
  'cat.destinations',
  'cat.nom_groups',
  'cat.nom_kinds',
  'cat.templates',
  'cat.nom',
];

module.exports = function ($p, log) {

  const {md, cat: {branches}, utils, job_prm, adapters: {pouch}} = $p;
  // порядок загрузки, чтобы при загрузке меньше оборванных ссылок
  const load_order = order(md);

  return async (req, res) => {
    const {query, path, paths} = req.parsed;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    try{
      const {user, parsed: {query, path, paths}} = req;
      const zone = paths[2];
      let suffix = paths[3];
      let branch = user && user.branch;
      if(branch && !branch.empty() && suffix !== 'common') {
        suffix = branch.suffix;
      }
      else if(suffix && (!branch || branch.empty())) {
        branches.find_rows({suffix}, (o) => {branch = o;});
      }
      if(!suffix) {
        suffix = '0000';
      }
      if(!branch) {
        branch = branches.get();
      }

      // если данные не общие, проверяем пользователя
      if(suffix !== 'common' && !user) {
        //return end500({res, {status: 403, message: 'Пользователь не авторизован'}, log});
      }

      // дополнительные маршруты
      if(paths[4] === 'prices') {
        return prices({res, zone, suffix});
      }

      if(query && query.includes('file=true')) {
        // путь настроек приложения
        if(!fs.existsSync(resolve(__dirname, `./cache/${zone}`))) {
          fs.mkdirSync(resolve(__dirname, `./cache/${zone}`));
        }
        if(!fs.existsSync(resolve(__dirname, `./cache/${zone}/${suffix}`))) {
          fs.mkdirSync(resolve(__dirname, `./cache/${zone}/${suffix}`));
        }
      }
      else {
        if(!fs.existsSync(resolve(__dirname, `./cache/${zone}/${suffix === 'common' ? '0000' : suffix}`))) {
          return end404(res, `/couchdb/mdm/${zone}/${suffix === 'common' ? '0000' : suffix}`);
        }
        manifest({res, zone, suffix, by_branch, common});
      }

      const tags = {};
      const stream = merge2();
      for(const names of load_order) {
        for(const name of names) {
          const mgr = md.mgr_by_class_name(name);
          if(mgr) {
            const fname = suffix === 'common' ?
              resolve(__dirname, `./cache/${zone}/0000/${name}.json`)
              :
              resolve(__dirname, `./cache/${zone}/${by_branch.includes(name) ? suffix : '0000'}/${name}.json`);

            if(query && query.includes('file=true')) {

              // в папках отделов держим только фильтруемые по отделу файлы
              if(!branch.empty() && !by_branch.includes(name)){
                continue;
              }

              const rows = [];
              (name === 'cch.predefined_elmnts' ? await load_predefined(pouch.remote.ram) : mgr).forEach((o) => {
                if(check_mdm({o, name, zone, branch, job_prm})) {
                  rows.push(patch(o, name));
                }
              });
              const text = JSON.stringify({name, rows}) + '\r\n';
              fs.writeFileSync(fname, text, 'utf8');
              res.write(`${name}\r\n`);
              tags[name] = {
                count: rows.length,
                size: text.length,
                crc32: utils.crc32(text),
              };
            }
            else {
              if(suffix === 'common' && !common.includes(name)) {
                continue;
              }
              if(suffix !== 'common' && common.includes(name)) {
                continue;
              }
              stream.add(fs.createReadStream(fname));
            }
          }
        }
      }
      if(query && query.includes('file=true')) {
        res.end();
        const fname = resolve(__dirname, `./cache/${zone}/${suffix}/manifest.json`);
        fs.writeFileSync(fname, JSON.stringify(tags), 'utf8');
      }
      else {
        stream.pipe(res);
        res.on('close', () => {
          stream.destroy();
        });
      }
    }
    catch(err){
      end500({res, err, log});
    }

  };
};


function patch(o, name, cat) {
  if(!o.toJSON) {
    return o;
  }
  const v = o.toJSON();
  // единицы измерения храним внутри номенклатуры
  if(name === 'cat.nom') {
    v.units = o.units;
  }
  // физлиц храним внутри пользователей
  else if(name === 'cat.users') {
    if(!o.individual_person.empty()) {
      v.person = o.individual_person.toJSON();
    }
  }
  return v;
}

function order (md) {
  const res = [
    new Set(['cch.properties']),
    new Set(),
    new Set(),
    new Set(),
    new Set(),
    new Set(),
    new Set(['cch.predefined_elmnts', 'doc.calc_order'])
  ];

  for(const class_name of md.classes().cat) {
    if(['abonents', 'servers', 'nom_units', 'individuals', 'meta_fields', 'meta_objs', 'property_values_hierarchy'].includes(class_name)) {
      continue;
    }
    else if(class_name === 'property_values' || class_name === 'contact_information_kinds') {
      res[1].add(`cat.${class_name}`);
    }
    else if(class_name === 'users') {
      res[2].add(`cat.${class_name}`);
    }
    else if(class_name.includes('nom')) {
      res[3].add(`cat.${class_name}`);
    }
    else if(class_name === 'formulas') {
      res[5].add(`cat.${class_name}`);
    }
    else{
      res[4].add(`cat.${class_name}`);
    }
  }
  return res;
}