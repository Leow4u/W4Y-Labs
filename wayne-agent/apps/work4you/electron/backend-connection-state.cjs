'use strict'

function createBackendConnectionState() {
  let generation = 0
  let process = null
  let promise = null

  return {
    startAttempt() {
      return { generation, promise: null }
    },

    setPromise(attempt, nextPromise) {
      if (attempt.generation !== generation) {
        return false
      }

      attempt.promise = nextPromise
      promise = nextPromise

      return true
    },

    isCurrentAttempt(attempt) {
      return attempt.generation === generation
    },

    attachProcess(attempt, nextProcess) {
      if (attempt.generation !== generation) {
        return null
      }

      process = nextProcess

      return { generation, process: nextProcess }
    },

    clearForCurrentProcess(owner) {
      if (owner.generation !== generation || owner.process !== process) {
        return false
      }

      process = null
      promise = null

      return true
    },

    clearPromiseForAttempt(attempt) {
      if (attempt.generation !== generation || (promise !== null && attempt.promise !== promise)) {
        return false
      }

      promise = null

      return true
    },

    getProcess() {
      return process
    },

    getPromise() {
      return promise
    },

    invalidate() {
      const currentProcess = process

      generation += 1
      process = null
      promise = null

      return currentProcess
    }
  }
}

module.exports = { createBackendConnectionState }
