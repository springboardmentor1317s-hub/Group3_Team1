import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-homepage',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './homepage.html',
  styleUrls: ['./homepage.css']
})
export class Homepage implements AfterViewInit {

  ngAfterViewInit() {
    const counters = document.querySelectorAll('.counter');

    counters.forEach(counter => {
      const target = +(counter as HTMLElement).getAttribute('data-target')!;
      let count = 0;

      const update = () => {
        const increment = target / 100;

        if (count < target) {
          count += increment;
          (counter as HTMLElement).innerText = Math.ceil(count).toString();
          setTimeout(update, 20);
        } else {
          (counter as HTMLElement).innerText = target + '+';
        }
      };

      update();
    });
  }
}
