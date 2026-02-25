import { UserService } from '@ghostfolio/client/services/user/user.service';
import { User } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-flex flex-column h-100' },
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule
  ],
  selector: 'gf-add-funds-dialog',
  standalone: true,
  templateUrl: './add-funds-dialog.component.html'
})
export class GfAddFundsDialogComponent {
  public amount: number;
  public currency: string;
  public isDemoUser = false;
  public isSubmitting = false;
  public user: User;

  private readonly PRESET_AMOUNTS = [1000, 5000, 10000, 50000];
  private unsubscribeSubject = new Subject<void>();
  private userService = inject(UserService);
  private dataService = inject(DataService);
  private snackBar = inject(MatSnackBar);
  public dialogRef = inject<MatDialogRef<GfAddFundsDialogComponent>>(MatDialogRef);

  public constructor() {
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;
          this.currency = state.user.settings.baseCurrency;
          this.isDemoUser = state.user.tags?.some((tag) => {
            return tag.id === 'DEMO' || tag.name === 'Demo';
          });
        }
      });
  }

  public ngOnInit() {
    if (!this.isDemoUser) {
      this.snackBar.open(
        $localize`This feature is only available for demo users.`,
        $localize`Close`,
        { duration: 3000 }
      );
      this.dialogRef.close();
    }
  }

  public setAmount(amount: number) {
    this.amount = amount;
  }

  public onAddFunds() {
    if (!this.amount || this.amount <= 0 || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;

    const order = {
      comment: $localize`Demo funds added`,
      currency: this.currency,
      date: new Date().toISOString(),
      dataSource: 'MANUAL' as const,
      fee: 0,
      quantity: 1,
      symbol: `GF_DEPOSIT_${Date.now()}`,
      tags: ['DEMO'],
      type: 'INTEREST' as const,
      unitPrice: this.amount
    };

    this.dataService.postOrder(order).subscribe({
      next: () => {
        this.snackBar.open(
          $localize`Successfully added ${this.currency} ${this.amount.toFixed(2)} to your account.`,
          $localize`Close`,
          { duration: 3000 }
        );
        this.userService
          .get(true)
          .pipe(takeUntil(this.unsubscribeSubject))
          .subscribe();
        this.dialogRef.close(true);
      },
      error: () => {
        this.snackBar.open(
          $localize`Failed to add funds. Please try again.`,
          $localize`Close`,
          { duration: 3000 }
        );
        this.isSubmitting = false;
      }
    });
  }

  public onCancel() {
    this.dialogRef.close();
  }

  public get presetAmounts() {
    return this.PRESET_AMOUNTS;
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }
}
