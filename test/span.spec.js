'use strict'

const proxyquire = require('proxyquire')
const Long = require('long')
const EventEmitter = require('@protobufjs/eventemitter')

describe('Span', () => {
  let Span
  let span
  let tracer
  let Recorder
  let recorder
  let platform

  beforeEach(() => {
    platform = { id: sinon.stub().returns(new Long(0, 0, true)), request: sinon.stub() }
    tracer = new EventEmitter()
    recorder = { record: sinon.stub() }
    Recorder = sinon.stub().returns(recorder)

    Span = proxyquire('../src/span', {
      './platform': platform,
      './tracer': tracer,
      './recorder': Recorder
    })
  })

  it('should have a default context', () => {
    span = new Span(tracer, { operationName: 'operation' })

    expect(span.context()).to.deep.equal({
      traceId: new Long(0, 0, true),
      spanId: new Long(0, 0, true),
      sampled: true,
      baggageItems: {}
    })
  })

  it('should store its tracer', () => {
    span = new Span(tracer, { operationName: 'operation' })

    expect(span.tracer()).to.equal(tracer)
  })

  it('should set the operation name', () => {
    span = new Span(tracer, { operationName: 'foo' })
    span.setOperationName('bar')

    expect(span._operationName).to.equal('bar')
  })

  it('should set baggage items', () => {
    span = new Span(tracer, { operationName: 'operation' })
    span.setBaggageItem('foo', 'bar')

    expect(span.context().baggageItems).to.have.property('foo', 'bar')
  })

  it('should set a tag', () => {
    span = new Span(tracer, { operationName: 'operation' })
    span.setTag('foo', 'bar')

    expect(span._tags).to.have.property('foo', 'bar')
  })

  it('should add tags', () => {
    span = new Span(tracer, { operationName: 'operation' })
    span.addTags({ foo: 'bar' })

    expect(span._tags).to.have.property('foo', 'bar')
  })

  it('should ensure tags are strings', () => {
    span = new Span(tracer, { operationName: 'operation' })
    span.addTags({ foo: 123 })

    expect(span._tags).to.have.property('foo', '123')
  })

  it('should record on finish', () => {
    recorder.record.returns(Promise.resolve())

    span = new Span(tracer, { operationName: 'operation' })
    span.finish()

    expect(recorder.record).to.have.been.calledWith(span)
  })

  it('should emit an error to its tracer when recording fails', done => {
    platform.request.throws('Error')
    done()
    tracer.on('error', e => {
      expect(e).to.be.instanceof(Error)
      done()
    })

    span = new Span(tracer, { operationName: 'operation' })
    span.finish()
  })

  it('should use a parent context', () => {
    const parent = {
      traceId: '123',
      sampled: false,
      baggageItems: { foo: 'bar' }
    }

    span = new Span(tracer, { operationName: 'operation', parent })

    expect(span.context()).to.deep.equal({
      traceId: '123',
      spanId: new Long(0, 0, true),
      sampled: false,
      baggageItems: { foo: 'bar' }
    })
  })
})
