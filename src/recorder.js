'use strict'

const platform = require('./platform')
const Long = require('long')

class DatadogRecorder {
  record (span) {
    const tracer = span.tracer()
    try {
      const traceId = span.context().traceId

      if (!tracer._spansToFlush) {
        tracer._spansToFlush = {}
      }
      if (!(traceId in tracer._spansToFlush)) {
        tracer._spansToFlush[traceId] = []
      }

      tracer._spansToFlush[traceId].push(span)
      tracer._numSpansBuffered++

      if (!tracer._flushScheduled) {
        // schedule a flush in 1 second
        tracer._flushScheduled = true
        setTimeout(() => {
          flushSpans(tracer)
          tracer._flushScheduled = false
        }, 1000)
      }
      
      if (!tracer._safetyFlushScheduled && tracer._numSpansBuffered > 1000) {
        tracer._safetyFlushScheduled = true
        setImmediate(() => {
          flushSpans(tracer)
          tracer._safetyFlushScheduled = false
        })
      }

    } catch (e) {
      tracer.emit('error', e)
    }
  }
}

function stringify (obj) {
  switch (typeof obj) {
    case 'object':
      if (Long.isLong(obj)) {
        return obj.toString()
      } else if (Array.isArray(obj)) {
        return '[' + obj.map(item => stringify(item)).join(',') + ']'
      } else if (obj !== null) {
        return '{' + Object.keys(obj)
          .map(key => `"${key}":` + stringify(obj[key]))
          .join(',') + '}'
      }

      return 'null'
    case 'string':
      return `"${obj}"`
    case 'number':
    case 'boolean':
      return String(obj)
  }
}

function flushSpans (tracer) {
  try {
    const spansData = []

    let spans = 0
    for (const id in tracer._spansToFlush) {
      spansData.push(tracer._spansToFlush[id].map((span) => {
        spans++
        const spanContext = span.context()
        return {
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
          parent_id: span._parentId || null,
          name: span._operationName,
          resource: span._tags.resource,
          service: tracer._service,
          type: span._tags.type,
          error: +!!span._tags.error,
          meta: span._tags,
          start: Math.round(span._startTime * 1e6),
          duration: Math.max(Math.round(span._duration * 1e6), 1)
        }
      }))
    }

    if (spans > 0) {
      const data = stringify(spansData).replace(/\n/g, '\\n')
      
      tracer._numSpansBuffered = 0
      tracer._spansToFlush = {}

      return platform.request({
        protocol: tracer._endpoint.protocol,
        hostname: tracer._endpoint.hostname,
        port: tracer._endpoint.port,
        path: '/v0.3/traces',
        method: 'PUT',
        data
      })
    }
  } catch (e) {
    tracer.emit('error', e)
  }
}

module.exports = DatadogRecorder
