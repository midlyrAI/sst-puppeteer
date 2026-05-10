import { type CommandLastExit, type CommandStatus } from '../../common/contract/command.js';

export interface CommandStatusChangeEvent {
  readonly type: 'command-status-change';
  readonly timestamp: number;
  readonly commandName: string;
  readonly from: CommandStatus;
  readonly to: CommandStatus;
  readonly lastExit?: CommandLastExit;
}
