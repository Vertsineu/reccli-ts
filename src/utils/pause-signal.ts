import { EventEmitter } from 'events';

/**
 * A pause signal that emits events when pause state changes
 * This allows for efficient event-driven pause/resume instead of polling
 */
export class PauseSignal extends EventEmitter {
    private _paused: boolean = false;

    get paused(): boolean {
        return this._paused;
    }

    set paused(value: boolean) {
        if (this._paused !== value) {
            this._paused = value;
            this.emit(value ? 'pause' : 'resume');
            this.emit('change', value);
        }
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
    }
}
