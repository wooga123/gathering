import { PermanentCard } from "./card.js";
import { ComputedAbility } from "./ability.js";
import { Battlefield } from "./globals.js";
import { ApplyHooks, DestroyPermanentHook, StatsHook } from "./hook.js";
import { Zone } from "./zone.js";
import { UI } from "./ui.js";
export class Permanent {
    uuid = Math.random();
    representedCard;
    name;
    baseTypes;
    text;
    manaCost;
    baseAbilities = [];
    eternalAbilities = [];
    tempAbilities = [];
    tapped_REAL = false;
    controller_REAL;
    owner;
    counters = {};
    constructor(card) {
        this.representedCard = card;
        this.name = card.name;
        this.baseTypes = card.types;
        this.text = card.text;
        if (card.manaCost)
            this.manaCost = card.manaCost;
        this.baseAbilities = card.abilities;
        if (!card.owner)
            throw new Error("Tried to create a permanent without specifying an owner!");
        this.controller = card.owner;
        this.owner = card.owner;
        Battlefield.push(this);
        UI.renderBattlefield();
    }
    get tapped() {
        return this.tapped_REAL;
    }
    set tapped(value) {
        this.tapped_REAL = value;
        UI.renderBattlefield();
    }
    destroy() {
        ApplyHooks(x => x instanceof DestroyPermanentHook, (that) => {
            Battlefield.splice(Battlefield.indexOf(that), 1);
            UI.renderBattlefield();
            if (that.representedCard.zone == Zone.battlefield)
                that.owner.moveCardTo(that.representedCard, Zone.graveyard);
        }, this);
    }
    sacrifice() {
        Battlefield.splice(Battlefield.indexOf(this), 1);
    }
    get controller() {
        // What is this doing here?
        return this.controller_REAL;
    }
    set controller(value) {
        if (this.controller && this.controller != value) {
            this.controller.zones.battlefield.splice(this.controller.zones.battlefield.indexOf(this.representedCard), 1);
            value.zones.battlefield.push(this.representedCard);
        }
        this.controller_REAL = value;
    }
    applyAbility(abil, temp = true) {
        if (temp)
            this.tempAbilities.push(abil);
        else
            this.eternalAbilities.push(abil);
    }
    addCounter(counter, amount = 1) {
        if (!this.counters[counter])
            this.counters[counter] = 0;
        this.counters[counter] += amount;
        /*TriggerEffects(Events.onAddCounter, {
          player: this.owner,
          card: this,
          counter: counter,
          amount: amount,
          total: this.counters[counter],
        });*/
    }
    get abilities() {
        let a = [
            ...this.tempAbilities,
            ...this.eternalAbilities,
            ...this.baseAbilities,
        ];
        return a.map(x => x instanceof ComputedAbility ? x.evaluate(this) : x).flat();
    }
    get selfAbilities() {
        let a = [
            ...this.tempAbilities,
            ...this.eternalAbilities,
            ...this.baseAbilities,
        ];
        return a.map(x => x instanceof ComputedAbility ? x.evaluate(this) : x).flat();
    }
    get types() {
        return this.baseTypes;
    }
}
export class Creature extends Permanent {
    staticPower;
    staticToughness;
    summoningSickness = true;
    attacking = false;
    blocking = [];
    damage = 0;
    ringBearer = false;
    constructor(card) {
        super(card);
        this.staticPower = card.power;
        this.staticToughness = card.toughness;
        /*if(this.abilities.filter(x => x instanceof HasteAbility).length)
          this.summoningSickness = false;*/
    }
    get basePower() {
        return typeof this.staticPower == 'number'
            ? this.staticPower
            : this.staticPower(this);
    }
    get baseToughness() {
        return typeof this.staticToughness == 'number'
            ? this.staticToughness
            : this.staticToughness(this);
    }
    getStat(stat) {
        return ApplyHooks(x => x instanceof StatsHook, (that, stat) => {
            return (stat == "power" ? that.basePower : that.baseToughness) + (this.counters['+1/+1'] || 0);
        }, this, stat);
    }
    get power() {
        return this.getStat("power");
    }
    get toughness() {
        return this.getStat("toughness");
    }
    get blockedBy() {
        return Battlefield.filter(x => x instanceof Creature && x.blocking.includes(this));
    }
    markAsAttacker(real = true) {
        return this.controller.markAsAttacker(this, real);
    }
    unmarkAsAttacker(real = true) {
        return this.controller.unmarkAsAttacker(this, real);
    }
    markAsBlocker(blocking, real = true) {
        return this.controller.markAsBlocker(this, blocking, real);
    }
    unmarkAsBlocker(blocking, real = true) {
        return this.controller.unmarkAsBlocker(this, blocking, real);
    }
    takeDamage(source, amount, combat = false) {
        let a = typeof amount == 'number' ? amount : amount();
        //TriggerEffects(Events.onDealDamage, {source: source, target: this, amount: a, combat: combat});
        this.damage += a;
        if (this.damage >= this.toughness)
            this.destroy();
    }
    removeDamage(amount = Infinity) {
        //TriggerEffects(Events.onRemoveDamage, {creature: this, amount: amount, removed: Math.min(amount, this.damage)})
        this.damage = Math.max(0, this.damage - amount);
    }
}
export class Emblem extends Permanent {
    constructor(name, text, abilities) {
        super(new PermanentCard(name, ['Emblem'], text, undefined, abilities));
    }
}
