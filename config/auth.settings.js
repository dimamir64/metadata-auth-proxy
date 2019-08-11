/**
 *
 *
 * @module auth.settings
 *
 * Created by Evgeniy Malyarov on 13.06.2019.
 */

module.exports = {
  providers: ['couchdb','google','ldap'],
  couchdb: {
    url: process.env.COUCHLOCAL ? process.env.COUCHLOCAL.replace('/wb_', '/_session') : 'http://cou221:5984/_session',
    authPrefix: 'Basic ',
  },
  github: {
    authPrefix: 'Github ',
  },
  google: {
    authPrefix: 'Google ',
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK || 'http://localhost:3006/auth/google/callback',
    passReqToCallback   : true,
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
  },
  ldap: {
    authPrefix: 'LDAP ',
    server: {
      url: process.env.LDAP_URL || 'ldap://ldap.ecookna.ru:65389',
      bindDN: process.env.LDAP_BIND || 'cn=ldap_auth,ou=Service Accounts SCOM,dc=ecookna,dc=ru',
      bindCredentials: process.env.LDAP_PASSWORD,
      searchBase: process.env.LDAP_BASE || 'dc=ecookna,dc=ru',
      searchFilter: process.env.LDAP_SEARCH || '(cn={{username}})',
    }
  },
  vkontakte: {
    authPrefix: 'Vkontakte ',
  },
  facebook: {
    authPrefix: 'Facebook ',
  }

}
