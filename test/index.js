'use strict'

const assert = require('node:assert')
const fs = require('node:fs')

const { Address } = require('address-rfc2821')

const fixtures = require('haraka-test-fixtures')
const connection = fixtures.connection

function _set_up(done) {
  this.plugin = new fixtures.plugin('rspamd')
  this.plugin.register()
  this.connection = connection.createConnection()
  this.connection.init_transaction()

  done()
}

describe('register', function () {
  beforeEach(_set_up)

  it('loads the rspamd plugin', function (done) {
    assert.equal('rspamd', this.plugin.name)
    done()
  })

  it('register loads zone-eu-rspamd.ini', function (done) {
    this.plugin.register()
    assert.ok(this.plugin.cfg)
    assert.equal(true, this.plugin.cfg.reject.spam)
    assert.ok(this.plugin.cfg.header.bar)
    done()
  })
})

describe('add_headers', function () {
  beforeEach(_set_up)

  it('add_headers exists as function', function (done) {
    // console.log(this.plugin.cfg);
    assert.equal('function', typeof this.plugin.add_headers)
    done()
  })

  it('adds a header to a message with positive score', function (done) {
    const test_data = {
      score: 1.1,
      symbols: {
        FOO: {
          name: 'FOO',
          score: 0.1,
          description: 'foo',
          options: ['foo', 'bar'],
        },
        BAR: {
          name: 'BAR',
          score: 1.0,
          description: 'bar',
        },
      },
    }
    this.plugin.cfg.main.add_headers = 'always'
    this.plugin.add_headers(this.connection, test_data)
    assert.deepEqual(
      this.connection.transaction.header.headers['x-rspamd-score'],
      ['1.1'],
    )
    assert.deepEqual(
      this.connection.transaction.header.headers['x-rspamd-bar'],
      ['+'],
    )
    assert.deepEqual(
      this.connection.transaction.header.headers['x-rspamd-report'],
      ['FOO(0.1) BAR(1)'],
    )
    done()
  })

  it('adds a header to a message with negative score', function (done) {
    const test_data = {
      score: -1,
    }
    this.plugin.cfg.main.add_headers = 'always'
    this.plugin.add_headers(this.connection, test_data)
    // console.log(this.connection.transaction.header);
    assert.deepEqual(
      this.connection.transaction.header.headers['x-rspamd-score'],
      ['-1'],
    )
    assert.deepEqual(
      this.connection.transaction.header.headers['x-rspamd-bar'],
      ['-'],
    )
    done()
  })
})

describe('wants_headers_added', function () {
  beforeEach(_set_up)

  it('wants no headers when add_headers=never', function (done) {
    this.plugin.cfg.main.add_headers = 'never'
    assert.equal(
      this.plugin.wants_headers_added({ action: 'add header' }),
      false,
    )
    done()
  })

  it('always wants no headers when add_headers=always', function (done) {
    this.plugin.cfg.main.add_headers = 'always'
    assert.equal(this.plugin.wants_headers_added({ action: 'beat it' }), true)
    done()
  })

  it('wants headers when rspamd response indicates, add_headers=sometimes', function (done) {
    this.plugin.cfg.main.add_headers = 'sometimes'
    assert.equal(
      this.plugin.wants_headers_added({ action: 'add header' }),
      true,
    )
    assert.equal(
      this.plugin.wants_headers_added({ action: 'brownlist' }),
      false,
    )
    done()
  })
})

describe('parse_response', function () {
  beforeEach(_set_up)

  it('returns undef on empty string', function (done) {
    // console.log(this.connection.transaction);
    assert.equal(this.plugin.parse_response('', this.connection), undefined)
    done()
  })

  it('returns undef on empty object', function (done) {
    assert.equal(this.plugin.parse_response('{}', this.connection), undefined)
    done()
  })
})

describe('get_options', function () {
  beforeEach(_set_up)

  it('punycodes non-ascii helo host', function (done) {
    this.connection.hello.host = 'm\u00fcnchen.example'

    const options = this.plugin.get_options(this.connection)

    assert.equal(options.headers.Helo, 'xn--mnchen-3ya.example')
    done()
  })

  it('punycodes non-ascii domain in mail_from', function (done) {
    this.connection.transaction.mail_from = new Address(
      'sender',
      'b\u00fccher.example',
    )

    const options = this.plugin.get_options(this.connection)

    assert.equal(options.headers.From, 'sender@xn--bcher-kva.example')
    done()
  })

  it('replaces non-ascii local part in mail_from', function (done) {
    this.connection.transaction.mail_from = new Address(
      'm\u00fcnchen',
      'example.com',
    )

    const options = this.plugin.get_options(this.connection)

    assert.equal(options.headers.From, 'utf8-local-part@example.com')
    done()
  })
})

describe('should_check', function () {
  beforeEach(function (done) {
    this.plugin = new fixtures.plugin('rspamd')
    this.plugin.register()
    this.connection = connection.createConnection()
    this.connection.init_transaction()

    // init defaults
    this.plugin.cfg.check.local_ip = false
    this.plugin.cfg.check.private_ip = false
    this.plugin.cfg.check.authenticated = false

    this.connection.remote.is_local = false
    this.connection.remote.is_private = false
    this.connection.notes.auth_user = undefined

    done()
  })

  it('checks authenticated', function (done) {
    this.connection.notes.auth_user = 'username'
    this.plugin.cfg.check.authenticated = true

    assert.equal(this.plugin.should_check(this.connection), true)
    done()
  })
  it('skips authenticated', function (done) {
    this.connection.notes.auth_user = 'username'
    this.plugin.cfg.check.authenticated = false

    assert.equal(this.plugin.should_check(this.connection), false)
    done()
  })
  it('skips relaying', function (done) {
    this.connection.relaying = true
    this.plugin.cfg.check.relay = false

    assert.equal(this.plugin.should_check(this.connection), false)
    done()
  })
  it('checks not relaying', function (done) {
    this.connection.relaying = false
    this.plugin.cfg.check.relay = false

    assert.equal(this.plugin.should_check(this.connection), true)
    done()
  })
  it('checks relaying when enabled', function (done) {
    this.connection.relaying = true
    this.plugin.cfg.check.relay = true

    assert.equal(this.plugin.should_check(this.connection), true)
    done()
  })
  it('checks local IP', function (done) {
    this.connection.remote.is_local = true
    this.plugin.cfg.check.local_ip = true

    assert.equal(this.plugin.should_check(this.connection), true)
    done()
  })
  it('skips local IP', function (done) {
    this.connection.remote.is_local = true
    this.plugin.cfg.check.local_ip = false

    assert.equal(this.plugin.should_check(this.connection), false)
    done()
  })
  it('checks private IP', function (done) {
    this.connection.remote.is_private = true
    this.plugin.cfg.check.private_ip = true

    assert.equal(this.plugin.should_check(this.connection), true)
    done()
  })
  it('skips private IP', function (done) {
    this.connection.remote.is_private = true
    this.plugin.cfg.check.private_ip = false

    assert.equal(this.plugin.should_check(this.connection), false)
    done()
  })
  it('checks public ip', function (done) {
    assert.equal(this.plugin.should_check(this.connection), true)
    done()
  })
  it('skip localhost if check.local_ip = false and check.private_ip = true', function (done) {
    this.connection.remote.is_local = true
    this.connection.remote.is_private = true

    this.plugin.cfg.check.local_ip = false
    this.plugin.cfg.check.private_ip = true

    assert.equal(this.plugin.should_check(this.connection), false)
    done()
  })
  it('checks localhost if check.local_ip = true and check.private_ip = false', function (done) {
    this.connection.remote.is_local = true
    this.connection.remote.is_private = true

    this.plugin.cfg.check.local_ip = true
    this.plugin.cfg.check.private_ip = false

    assert.equal(this.plugin.should_check(this.connection), true)
    done()
  })
})

describe.skip('data_post', function () {
  beforeEach(_set_up)

  it('streams a message to rspamd and gets response', function (done) {
    this.plugin.cfg.main.host = 'mail.example.com'
    this.plugin.cfg.main.timeout = 29000
    this.plugin.cfg.check.local_ip = true
    this.plugin.cfg.check.private_ip = true
    this.plugin.cfg.check.relay = true

    this.connection.remote.ip = '209.85.208.48'
    this.connection.hello.host = 'mail-ed1-f48.google.com'

    const specimen = fs.readFileSync('./test/fixtures/spam.eml', 'utf8')

    for (const line of specimen.split(/\r?\n/g)) {
      this.connection.transaction.add_data(`${line}\r\n`)
    }

    this.connection.transaction.end_data()
    this.connection.transaction.ensure_body()

    this.plugin.hook_data_post(() => {
      done()
    }, this.connection)
  })
})
