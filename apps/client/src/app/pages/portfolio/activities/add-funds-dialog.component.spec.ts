import { User } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { MatDialogRef, MatSnackBar } from '@angular/material/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, Subject, throwError } from 'rxjs';

import { GfAddFundsDialogComponent } from './add-funds-dialog.component';
import { UserService } from '@ghostfolio/client/services/user/user.service';

jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class {}
}));

describe('GfAddFundsDialogComponent', () => {
  let component: GfAddFundsDialogComponent;
  let fixture: ComponentFixture<GfAddFundsDialogComponent>;
  let dataService: { postOrder: jest.Mock };
  let userService: {
    get: jest.Mock;
    stateChanged: Subject<{ user?: User }>;
  };
  let snackBar: { open: jest.Mock };
  let dialogRef: { close: jest.Mock };

  const emitState = (user?: User) => {
    userService.stateChanged.next({ user });
    fixture.detectChanges();
  };

  const createUser = (accountCount = 1): User =>
    ({
      accounts: Array.from({ length: accountCount }).map((_, index) => ({
        id: `account-${index + 1}`
      })),
      access: [],
      activitiesCount: 0,
      dateOfFirstActivity: new Date(),
      id: 'user-id',
      permissions: [],
      settings: {
        baseCurrency: 'USD',
        locale: 'en',
        isRestrictedView: false
      },
      subscription: {
        offer: undefined,
        type: 'FREE'
      },
      tags: []
    } as unknown as User);

  beforeEach(async () => {
    userService = {
      get: jest.fn(),
      stateChanged: new Subject<{ user?: User }>()
    };
    dataService = { postOrder: jest.fn() };
    snackBar = { open: jest.fn() };
    dialogRef = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, GfAddFundsDialogComponent],
      providers: [
        { provide: DataService, useValue: dataService },
        { provide: UserService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GfAddFundsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('posts a seeded funds order with account balance update', () => {
    const user = createUser();
    const amount = 2500;

    dataService.postOrder.mockReturnValue(of({}));
    userService.get.mockReturnValue(of(user));
    emitState(user);
    component.setAmount(amount);

    component.onAddFunds();

    expect(dataService.postOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        comment: $localize`Seed funds added`,
        currency: 'USD',
        dataSource: 'MANUAL',
        date: expect.any(String),
        fee: 0,
        quantity: 1,
        symbol: expect.stringMatching(/^GF_SEED_\d+$/),
        tags: [],
        type: 'INTEREST',
        updateAccountBalance: true,
        unitPrice: amount
      })
    );
    expect(userService.get).toHaveBeenCalledWith(true);
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('does not submit when the amount is not positive', () => {
    emitState(createUser());
    component.setAmount(0);

    component.onAddFunds();

    expect(dataService.postOrder).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('does not submit when user has no accounts and shows warning', () => {
    emitState(createUser(0));
    component.setAmount(500);

    component.onAddFunds();

    expect(dataService.postOrder).not.toHaveBeenCalled();
  });

  it('keeps retry enabled after a failed seed order request', () => {
    const user = createUser();

    dataService.postOrder.mockReturnValue(
      throwError(() => new Error('Order failed'))
    );
    emitState(user);
    component.setAmount(500);

    component.onAddFunds();

    expect(dataService.postOrder).toHaveBeenCalledTimes(1);
    expect(component.isSubmitting).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
