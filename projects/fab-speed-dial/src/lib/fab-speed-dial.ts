import {
    AfterContentInit,
    Component,
    ContentChild,
    ContentChildren,
    ElementRef,
    EventEmitter,
    HostBinding,
    HostListener,
    Inject,
    Injector,
    Input,
    OnDestroy,
    Output,
    QueryList,
    Renderer2,
    ViewEncapsulation,
} from '@angular/core';
import { MatButton } from '@angular/material';
import { DOCUMENT } from '@angular/common';
import { forkJoin, fromEvent, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

const Z_INDEX_ITEM = 23;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type AnimationMode = 'fling' | 'scale';

@Component({
    selector: 'eco-fab-speed-dial-actions',
    template: `
        <ng-content select="button" *ngIf="miniFabVisible"></ng-content>`,
})
export class EcoFabSpeedDialActionsComponent implements AfterContentInit {
    private _parent: EcoFabSpeedDialComponent;

    @ContentChildren(MatButton) _buttons: QueryList<MatButton>;

    /**
     * Whether the min-fab button exist in DOM
     */
    public miniFabVisible = false;

    /**
     * The timeout ID for the callback to show the mini-fab buttons
     */
    private showMiniFabAnimation: number;

    /**
     * When we will remove mini-fab buttons from DOM, after the animation is complete
     */
    private hideMiniFab: Subscription | null;

    constructor(injector: Injector, private renderer: Renderer2) {
        this._parent = injector.get(EcoFabSpeedDialComponent);
    }

    ngAfterContentInit(): void {
        this._buttons.changes.subscribe(() => {
            this.initButtonStates();
            this._parent.setActionsVisibility();
        });

        this.initButtonStates();
    }

    private initButtonStates(): void {
        this._buttons.forEach((button, i) => {
            this.renderer.addClass(button._getHostElement(), 'eco-fab-action-item');
            this.changeElementStyle(button._getHostElement(), 'z-index', '' + (Z_INDEX_ITEM - i));
        });
    }

    show(): void {
        if (!this._buttons) {
            return;
        }

        this.resetAnimationState();
        this.miniFabVisible = true;

        this.showMiniFabAnimation = setTimeout(() => {
            this._buttons.forEach((button, i) => {
                let transitionDelay = 0;
                let transform;
                if (this._parent.animationMode === 'scale') {
                    // Incremental transition delay of 65ms for each action button
                    transitionDelay = 3 + (65 * i);
                    transform = 'scale(1)';
                } else {
                    transform = this.getTranslateFunction('0');
                }

                const hostElement = button._getHostElement();
                this.changeElementStyle(hostElement, 'transition-delay', transitionDelay + 'ms');
                this.changeElementStyle(hostElement, 'opacity', '1');
                this.changeElementStyle(hostElement, 'transform', transform);
            });
        }, 50); // Be sure that *ngIf can show elements before trying to animate them
    }

    private resetAnimationState(): void {
        clearTimeout(this.showMiniFabAnimation);
        if (this.hideMiniFab) {
            this.hideMiniFab.unsubscribe();
            this.hideMiniFab = null;
        }
    }

    hide(): void {
        if (!this._buttons) {
            return;
        }

        this.resetAnimationState();

        const obs = this._buttons.map((button, i) => {
            let opacity = '1';
            let transitionDelay = 0;
            let transform;

            if (this._parent.animationMode === 'scale') {
                transitionDelay = 3 - (65 * i);
                transform = 'scale(0)';
                opacity = '0';
            } else {
                transform = this.getTranslateFunction((55 * (i + 1) - (i * 5)) + 'px');
            }

            const hostElement = button._getHostElement();

            this.changeElementStyle(hostElement, 'transition-delay', transitionDelay + 'ms');
            this.changeElementStyle(hostElement, 'opacity', opacity);
            this.changeElementStyle(hostElement, 'transform', transform);

            return fromEvent(hostElement, 'transitionend').pipe(take(1));
        });

        // Wait for all animation to finish, then destroy their elements
        this.hideMiniFab = forkJoin(obs).subscribe(() => this.miniFabVisible = false);

    }

    private getTranslateFunction(value: string): string {
        const dir = this._parent.direction;
        const translateFn = (dir === 'up' || dir === 'down') ? 'translateY' : 'translateX';
        const sign = (dir === 'down' || dir === 'right') ? '-' : '';

        return translateFn + '(' + sign + value + ')';
    }

    private changeElementStyle(elem: any, style: string, value: string) {
        // FIXME - Find a way to create a "wrapper" around the action button(s) provided by the user, so we don't change it's style tag
        this.renderer.setStyle(elem, style, value);
    }
}

/** @dynamic @see https://github.com/angular/angular/issues/20351#issuecomment-344009887 */
@Component({
    selector: 'eco-fab-speed-dial',
    template: `
        <div class="eco-fab-speed-dial-container">
            <ng-content select="eco-fab-speed-dial-trigger"></ng-content>
            <ng-content select="eco-fab-speed-dial-actions"></ng-content>
        </div>
    `,
    styleUrls: ['fab-speed-dial.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class EcoFabSpeedDialComponent implements OnDestroy, AfterContentInit {
    private isInitialized = false;
    private _direction: Direction = 'up';
    private _open = false;
    private _animationMode: AnimationMode = 'fling';
    private _fixed = false;
    private _documentClickUnlistener: (() => void) | null = null;

    /**
     * Whether this speed dial is fixed on screen (user cannot change it by clicking)
     */
    @Input() get fixed(): boolean {
        return this._fixed;
    }

    set fixed(fixed: boolean) {
        this._fixed = fixed;
        this._processOutsideClickState();
    }

    /**
     * Whether this speed dial is opened
     */
    @HostBinding('class.eco-opened')
    @Input() get open(): boolean {
        return this._open;
    }

    set open(open: boolean) {
        const previousOpen = this._open;
        this._open = open;
        if (previousOpen !== this._open) {
            this.openChange.emit(this._open);
            if (this.isInitialized) {
                this.setActionsVisibility();
            }
        }
    }

    /**
     * The direction of the speed dial. Can be 'up', 'down', 'left' or 'right'
     */
    @Input() get direction(): Direction {
        return this._direction;
    }

    set direction(direction: Direction) {
        const previousDirection = this._direction;
        this._direction = direction;
        if (previousDirection !== this.direction) {
            this._setElementClass(previousDirection, false);
            this._setElementClass(this.direction, true);

            if (this.isInitialized) {
                this.setActionsVisibility();
            }
        }
    }

    /**
     * The animation mode to open the speed dial. Can be 'fling' or 'scale'
     */
    @Input() get animationMode(): AnimationMode {
        return this._animationMode;
    }

    set animationMode(animationMode: AnimationMode) {
        const previousAnimationMode = this._animationMode;
        this._animationMode = animationMode;
        if (previousAnimationMode !== this._animationMode) {
            this._setElementClass(previousAnimationMode, false);
            this._setElementClass(this.animationMode, true);

            if (this.isInitialized) {
                // To start another detect lifecycle and force the "close" on the action buttons
                Promise.resolve(null).then(() => this.open = false);
            }
        }
    }

    @Output() openChange: EventEmitter<boolean> = new EventEmitter<boolean>();

    @ContentChild(EcoFabSpeedDialActionsComponent) _childActions: EcoFabSpeedDialActionsComponent;

    constructor(private elementRef: ElementRef, private renderer: Renderer2, @Inject(DOCUMENT) private document: Document) {
    }

    ngAfterContentInit(): void {
        this.isInitialized = true;
        this.setActionsVisibility();
        this._setElementClass(this.direction, true);
        this._setElementClass(this.animationMode, true);
    }

    ngOnDestroy() {
        this._unsetDocumentClickListener();
    }

    /**
     * Toggle the open state of this speed dial
     */
    public toggle(): void {
        this.open = !this.open;
    }

    @HostListener('click')
    _onClick(): void {
        if (!this.fixed && this.open) {
            this.open = false;
        }
    }

    setActionsVisibility(): void {
        if (!this._childActions) {
            return;
        }

        if (this.open) {
            this._childActions.show();
        } else {
            this._childActions.hide();
        }
        this._processOutsideClickState();
    }

    private _setElementClass(elemClass: string, isAdd: boolean): void {
        const finalClass = `eco-${elemClass}`;
        if (isAdd) {
            this.renderer.addClass(this.elementRef.nativeElement, finalClass);
        } else {
            this.renderer.removeClass(this.elementRef.nativeElement, finalClass);
        }
    }

    private _processOutsideClickState() {
        if (!this.fixed && this.open) {
            this._setDocumentClickListener();
        } else {
            this._unsetDocumentClickListener();
        }
    }

    private _setDocumentClickListener() {
        if (!this._documentClickUnlistener) {
            this._documentClickUnlistener = this.renderer.listen(this.document, 'click', () => {
                this.open = false;
            });
        }
    }

    private _unsetDocumentClickListener() {
        if (this._documentClickUnlistener) {
            this._documentClickUnlistener();
            this._documentClickUnlistener = null;
        }
    }

}

@Component({
    selector: 'eco-fab-speed-dial-trigger',
    template: `
        <ng-content select="button"></ng-content>`,
})
export class EcoFabSpeedDialTriggerComponent {
    private _parent: EcoFabSpeedDialComponent;

    /**
     * Whether this trigger should spin (360dg) while opening the speed dial
     */
    @HostBinding('class.eco-spin') get sp() {
        return this.spin;
    }

    @Input() spin = false;

    constructor(injector: Injector) {
        this._parent = injector.get(EcoFabSpeedDialComponent);
    }

    @HostListener('click', ['$event'])
    _onClick(event: Event): void {
        if (!this._parent.fixed) {
            this._parent.toggle();
            event.stopPropagation();
        }
    }

}
