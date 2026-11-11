import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/ui/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
