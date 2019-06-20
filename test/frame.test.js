import { applyFixtures } from './support/fixtures';
import assert from 'assert';
import { initRecurly, testBed } from './support/helpers';

describe('Recurly.Frame', function () {
  const path = '/frame_mock';
  const payload = { example: 'data', event: 'test-event' };

  beforeEach(function (done) {
    this.recurly = initRecurly();
    this.sandbox = sinon.createSandbox();
    this.newWindow = { close: sinon.stub() };
    this.isIE = !!document.documentMode;

    this.sandbox.stub(window, 'open').callsFake(url => {
      this.eventName = url.match(/(recurly-frame-\w+-\w+)/)[0];
      return this.newWindow;
    });

    // HACK: when we're in an IE environment, we need to stub the relay creation;
    //       however, we want to proceed as normal in all other circumstances
    this.sandbox.stub(window.document.body, 'appendChild').callsFake(function (maybeRelay) {
      if (~(maybeRelay.name || '').indexOf('recurly-relay-')) maybeRelay.onload();
      else this.appendChild.wrappedMethod.call(this, maybeRelay);
    });

    this.recurly.ready(() => {
      this.frame = this.recurly.Frame({ path });
      done();
    });
  });

  afterEach(function () {
    const { frame, sandbox, recurly } = this;
    sandbox.restore();
    if (frame) frame.destroy();
  });

  applyFixtures();

  this.ctx.fixture = 'empty';

  it('calls window.open', function () {
    assert(window.open.calledOnce);
  });

  it('sends Recurly.version in the url', function () {
    const { recurly } = this;
    assert(window.open.calledWithMatch(`version=${recurly.version}`));
  });

  it('sends a listener event name to the opened url', function () {
    assert(window.open.calledWithMatch(/recurly-frame-\w+-\w+/));
  });

  it('listens for the frame event', function () {
    const { sandbox, eventName, frame } = this;
    assert(frame.hasListeners(eventName));
  });

  describe('when given a path', function () {
    const examples = [
      '/paypal/start',
      'google.com',
      'bfjbkdfs'
    ];

    it('opens the url relative to recurly.config.api', function () {
      const { recurly } = this;
      examples.forEach(path => {
        const frame = recurly.Frame({ path });
        assert(window.open.calledWithMatch(recurly.config.api + path));
        frame.destroy();
      });
    });
  });

  describe('when given data', function () {
    it('encodes the data into the opener url', function () {
      this.frame = this.recurly.Frame({ path, payload });
      assert(window.open.calledWithMatch('example=data'));
    });

    it('produces a valid composite querystring of given and additional data', function () {
      this.frame = this.recurly.Frame({ path, payload });
      assert(window.open.calledWithMatch(function (url) {
        return (url.match(/\?/) || []).length;
      }));
    });
  });

  describe('when the browser is detected to be IE', function () {
    beforeEach(function () {
      const { sandbox, isIE } = this;

      if (!isIE) document.documentMode = 'test';

      // rerun this to account for IE mocking
      this.frame = this.recurly.Frame({ path });
    });

    afterEach(function () {
      if (!this.isIE) delete document.documentMode;
    });

    it('creates a relay', function () {
      const { sandbox, frame } = this;
      const { relay } = frame;
      sandbox.spy(frame, 'create');

      assert(relay instanceof HTMLIFrameElement);
      assert.strictEqual(relay.width, '0');
      assert.strictEqual(relay.height, '0');
      assert.strictEqual(!!~relay.src.indexOf('/api/relay'), true);
      assert.strictEqual(relay.name, `recurly-relay-${frame.id}`);
      assert.strictEqual(relay.style.display, 'none');
      assert(relay.onload instanceof Function);
      assert(frame.create.notCalled);
      relay.onload();
      assert(frame.create.calledOnce);
    });

    describe('destroy', function () {
      it('removes the relay', function () {
        const { sandbox, recurly } = this;
        const { body } = window.document;
        sandbox.stub(body, 'contains').returns(true);
        sandbox.stub(body, 'removeChild').returns(true);
        const frame = this.frame = recurly.Frame({ path });
        frame.destroy();
        assert(body.removeChild.calledOnce);
        assert(body.removeChild.calledWithExactly(frame.relay));
      });
    });
  });

  describe('destroy', function () {
    it('closes the window', function () {
      const { recurly, newWindow } = this;
      const frame = recurly.Frame({ path, payload });
      assert(newWindow.close.notCalled);
      frame.destroy();
      assert(newWindow.close.calledOnce);
    });
  });

  describe('when type=iframe', function () {
    it('requires a container', function () {
      const { recurly } = this;
      assert.throws(() => {
        this.frame = recurly.Frame({ path, payload, type: 'iframe' });
      }, 'Invalid container. Expected HTMLElement, got undefined');
    });

    describe('when given a container', function () {
      beforeEach(function (done) {
        const { recurly, isIE } = this;
        if (isIE) window.document.body.appendChild.restore();
        this.frame = recurly.Frame({ path, payload, type: 'iframe', container: testBed() });
        this.frame.on('done', () => done());
      });

      it('injects an iframe into the container', function () {
        assert.strictEqual(testBed().children[0], this.frame.iframe);
      });

      it('sets the url appropriately', function () {
        const { recurly } = this;
        const { src } = this.frame.iframe;
        assert(~src.indexOf('/frame_mock'));
        assert(~src.indexOf('example=data'));
        assert(~src.indexOf(`version=${recurly.version}`));
        assert(~src.indexOf('event=recurly-frame-'));
        assert(~src.indexOf('key=test'));
      });

      describe('Frame.destroy', function () {
        it('removes the iframe', function () {
          const { frame } = this;
          frame.destroy();
          assert.strictEqual(testBed().children[0], undefined);
          assert.strictEqual(frame.iframe, undefined);
        });
      });
    });
  });
});
