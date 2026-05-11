import { describe, expect, it } from 'vitest';
import {
  isKnownStreamType,
  isSstBusEvent,
  type StreamMessage,
} from '../../../src/core/infra/stream/sst-bus-event.js';

describe('sst-bus-event', () => {
  it('isKnownStreamType identifies the canonical event types', () => {
    expect(isKnownStreamType('project.StackCommandEvent')).toBe(true);
    expect(isKnownStreamType('project.CompleteEvent')).toBe(true);
    expect(isKnownStreamType('project.BuildSuccessEvent')).toBe(true);
    expect(isKnownStreamType('project.BuildFailedEvent')).toBe(true);
    expect(isKnownStreamType('deployer.DeployRequestedEvent')).toBe(true);
    expect(isKnownStreamType('aws.FunctionInvokedEvent')).toBe(false);
    expect(isKnownStreamType('totally-unknown')).toBe(false);
  });

  it('isSstBusEvent narrows on a known message', () => {
    const msg: StreamMessage = {
      type: 'project.StackCommandEvent',
      event: { App: 'a', Stage: 's', Config: 'c', Command: 'deploy', Version: '0' },
    };
    expect(isSstBusEvent(msg)).toBe(true);
    if (isSstBusEvent(msg) && msg.type === 'project.StackCommandEvent') {
      expect(msg.event.Command).toBe('deploy');
    }
  });
});
