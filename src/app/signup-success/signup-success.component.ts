import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-signup-success',
  standalone: true,
  templateUrl: './signup-success.component.html',
  styleUrls: ['./signup-success.component.scss']
})
export class SignupSuccessComponent implements OnInit, OnDestroy {
  totalSeconds = 5; // total countdown duration
  remaining = this.totalSeconds;
  // SVG progress
  circumference = 2 * Math.PI * 28; // radius 28
  dashOffset = 0;

  private _rafId?: number;
  private _startTime = 0;

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.startSmoothCountdown();
  }

  ngOnDestroy(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = undefined;
    }
  }

  private startSmoothCountdown() {
    this._startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - this._startTime; // ms
      const progress = Math.min(1, elapsed / (this.totalSeconds * 1000));

      // dashOffset increases from 0 -> circumference
      this.dashOffset = this.circumference * progress;

      // remaining displayed as integer seconds left (ceil)
      const secondsLeft = Math.max(0, Math.ceil(this.totalSeconds - elapsed / 1000));
      if (secondsLeft !== this.remaining) {
        this.remaining = secondsLeft;
      }

      // request change detection and next frame
      this.cdr.detectChanges();

      if (progress < 1) {
        this._rafId = requestAnimationFrame(tick);
      } else {
        // finished
        this.router.navigate(['/login']);
      }
    };

    this._rafId = requestAnimationFrame(tick);
  }
}

