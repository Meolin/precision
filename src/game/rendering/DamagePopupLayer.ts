import { Container, Graphics, Text } from 'pixi.js';
import { sampleDamagePopup, type DamagePopup } from '../effects/DamagePopup';

const cardStyle = {
  minWidth: 34,
  height: 22,
  horizontalPadding: 7,
  cornerRadius: 5,
  background: 0x172022,
  accent: 0xf5af73,
  text: 0xffe4c2,
};

/** One persistent Pixi card per hit; only its transform and opacity change per frame. */
export class DamagePopupLayer {
  readonly container = new Container({ eventMode: 'none' });
  private cards = new Map<DamagePopup, Container>();

  update(popups: readonly DamagePopup[], timeSeconds: number, pixel: number): void {
    const active = new Set(popups);
    for (const [popup, card] of this.cards) {
      if (active.has(popup) && timeSeconds < popup.expiresAtSeconds) continue;
      this.container.removeChild(card);
      card.destroy({ children: true });
      this.cards.delete(popup);
    }
    for (const popup of popups) {
      if (timeSeconds >= popup.expiresAtSeconds) continue;
      let card = this.cards.get(popup);
      if (!card) {
        card = this.createCard(popup);
        this.cards.set(popup, card);
        this.container.addChild(card);
      }
      const sample = sampleDamagePopup(popup, timeSeconds);
      card.position.set(sample.x, sample.y);
      // Card dimensions are screen pixels; position and travel remain in world meters.
      card.scale.set(pixel * popup.sizeMultiplier);
      card.alpha = sample.alpha;
    }
  }

  private createCard(popup: DamagePopup): Container {
    const card = new Container();
    const amount = popup.damage < 0.1 ? '<0.1' : String(Number(popup.damage.toFixed(1)));
    const label = new Text({
      text: popup.damage > 0 ? `−${amount}` : '0',
      style: {
        fontFamily: 'Consolas, monospace',
        fontSize: 14,
        fontWeight: '700',
        fill: cardStyle.text,
      },
      resolution: 2,
    });
    label.anchor.set(0.5);
    const width = Math.max(cardStyle.minWidth, label.width + cardStyle.horizontalPadding * 2);
    const background = new Graphics();
    background
      .roundRect(
        -width / 2,
        -cardStyle.height / 2 + 2,
        width,
        cardStyle.height,
        cardStyle.cornerRadius,
      )
      .fill({ color: 0x000000, alpha: 0.25 });
    background
      .roundRect(-width / 2, -cardStyle.height / 2, width, cardStyle.height, cardStyle.cornerRadius)
      .fill({ color: cardStyle.background, alpha: 0.96 })
      .stroke({ color: cardStyle.accent, width: 1, alpha: 0.85 });
    card.addChild(background, label);
    return card;
  }

  destroy(): void {
    this.cards.clear();
    this.container.destroy({ children: true });
  }
}
