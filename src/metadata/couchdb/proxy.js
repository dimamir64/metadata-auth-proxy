/**
 *
 *
 * @module proxy
 *
 * Created by Evgeniy Malyarov on 14.06.2019.
 */

import urlJoin from 'url-join';
import urlParse from 'url-parse';
import ajaxCore from 'pouchdb-ajax';
import {toPromise} from 'pouchdb-utils';
import oAuthPopup from './popup';

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.name = 'authentication_error';
    this.error = true;
    try {
      Error.captureStackTrace(this, AuthError);
    } catch (e) {}
  }
}

function getBaseUrl({__opts, name}) {
  // Parse database url
  const prefix = __opts && __opts.prefix ? __opts.prefix + '/' : '';
  const url = urlParse(prefix + name);
  return url.origin;
}


function getSessionUrl(db) {
  const {_auth_provider} = db.__opts.owner.props;
  return urlJoin(getBaseUrl(db), `/auth/${_auth_provider || ''}`);
}

function getBasicAuthHeaders({prefix = 'Basic ', username, password}) {
  const str = username + ':' + password;
  const token = btoa(unescape(encodeURIComponent(str)));
  return {Authorization: prefix + token};
}

const logIn = toPromise(function (username = '', password, opts, callback) {
  if (typeof callback === 'undefined') {
    callback = opts;
    opts = {};
  }
  if (['http', 'https'].indexOf(this.type()) === -1) {
    return callback(new AuthError('this plugin only works for the http/https adapter'));
  }

  const {owner} = this.__opts;
  const prefix = owner.auth_prefix();
  if(['ldap','basic'].includes(prefix.toLowerCase().trim())){
    if (!username) {
      return callback(new AuthError('you must provide a username'));
    } else if (!password) {
      return callback(new AuthError('you must provide a password'));
    }

    const names = username.trim().split(' as ');
    username = names[0].trim();
    const impersonation = names[1] && names[1].trim();

    const ajaxOpts = Object.assign({
      method: 'POST',
      url: getSessionUrl(this),
      headers: Object.assign({'Content-Type': 'application/json'}, getBasicAuthHeaders({prefix, username, password})),
      body: {name: username, password},
    }, opts.ajax || {});
    if(impersonation) {
      ajaxOpts.headers.impersonation = encodeURI(impersonation);
    }
    ajaxCore(ajaxOpts, (err, res) => {
      if(err) {
        callback(err, res);
      }
      else {
        delete ajaxOpts.method;
        delete ajaxOpts.body;
        ajaxOpts.url = this.name.replace(/_.*$/, '_meta');
        ajaxCore(ajaxOpts, (err, info) => {
          if(err) {
            callback(err);
          }
          else {
            if(impersonation) {
              res.su = username;
            }
            callback(null, res);
          }
        });
      }
    });
  }
  else {
    oAuthPopup(getSessionUrl(this))
      .then((res) => callback(null, res))
      .catch((err) => callback(err));
  }

});

const logOut = toPromise(function (opts, callback) {
  if (typeof callback === 'undefined') {
    callback = opts;
    opts = {};
  }
  const {__opts} = this;
  const ajaxOpts = Object.assign({
    method: 'DELETE',
    url: getSessionUrl(this),
    headers: getBasicAuthHeaders(Object.assign({prefix: __opts.owner.auth_prefix()}, __opts.auth)),
  }, opts.ajax || {});
  ajaxCore(ajaxOpts, callback);
});

export default {
  login: logIn,
  logIn: logIn,
  logout: logOut,
  logOut: logOut,
};
