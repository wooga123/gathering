import { Battlefield, StackManager, TurnManager } from "./globals.js";
import { Creature } from "./permanent.js";
import { TapCost } from "./cost.js";
import { ApplyHooks, BeginStepHook } from "./hook.js";
import { Mana, ManaFromSymbols } from "./mana.js";
export var Step;
(function (Step) {
    Step[Step["untap"] = 100] = "untap";
    Step[Step["upkeep"] = 101] = "upkeep";
    Step[Step["draw"] = 102] = "draw";
    Step[Step["precombat_main"] = 200] = "precombat_main";
    Step[Step["declare_attackers"] = 301] = "declare_attackers";
    Step[Step["declare_blockers"] = 302] = "declare_blockers";
    Step[Step["deal_damage"] = 303] = "deal_damage";
    Step[Step["postcombat_main"] = 400] = "postcombat_main";
    Step[Step["end"] = 500] = "end";
    Step[Step["cleanup"] = 501] = "cleanup";
})(Step || (Step = {}));
export class TurnManagerClass {
    playerList = [];
    currentPlayer;
    defendingPlayer;
    passedPriority;
    endedPhase;
    endedTurn;
    step = Step.untap;
    stepIndex = 0;
    stepList = [
        Step.untap,
        Step.upkeep,
        Step.draw,
        Step.precombat_main,
        Step.declare_attackers,
        Step.declare_blockers,
        Step.deal_damage,
        Step.postcombat_main,
        Step.end,
        Step.cleanup,
    ];
    constructor(...plist) {
        this.playerList = plist;
        this.currentPlayer = plist[0];
    }
    get stepName() {
        return Step[this.step];
    }
    async beginStep() {
        ApplyHooks(x => x instanceof BeginStepHook, async (that) => {
            // Trigger certain effects based on what step just started
            if (that.step == Step.untap) {
                for (let i of Battlefield.filter(x => x.controller == that.currentPlayer)) {
                    i.tapped = false;
                    if (i instanceof Creature)
                        i.summoningSickness = false;
                }
            }
            else if (that.step == Step.declare_attackers) {
                // ??? does anything need to be done here
            }
            else if (that.step == Step.declare_blockers) {
                if (that.currentPlayer.attackers.length) {
                    // Ask for defending player.
                    if (that.playerList.length > 2) {
                        that.currentPlayer.selectTargets(undefined, t => t.length == 1 &&
                            that.playerList.includes(t[0]) && // Clever avoidance of using `Player`
                            t[0] != that.currentPlayer, () => that.playerList.length >= 2, "Select defending player", result => {
                            that.defendingPlayer = result[0];
                        });
                    }
                    else
                        that.defendingPlayer = that.playerList.filter(x => x != that.currentPlayer)[0];
                }
                for (let i of that.currentPlayer.attackers) {
                    new TapCost(true).pay(i, true);
                }
            }
            else if (that.step == Step.deal_damage) {
                for (let i of that.currentPlayer.attackers) {
                    let bs = i.blockedBy;
                    if (bs.length) {
                        let bs2 = [];
                        if (bs.length > 1) {
                            while (bs.length > 1) {
                                let chosen;
                                that.defendingPlayer.selectTargets(undefined, t => t.length == 1 &&
                                    bs.includes(i), () => true, // Should always be blockers
                                'Select an order for the blockers', result => {
                                    chosen = result[0];
                                });
                                bs2.push(chosen);
                                bs.splice(bs.indexOf(chosen), 1);
                            }
                        }
                        else {
                            bs2 = bs;
                        }
                        // Deal damage to only the first one if no trample, carry over if trample.
                        /*if (i.abilities.filter(x => x instanceof TrampleAbility).length) {
                          let p = i.power; let n = 0;
                          while (p && n < bs2.length) {
                            let v = Math.min(bs2[n].toughness, p);
                            bs2[n].takeDamage(i, v, true);
                            p -= v;
                            n++;
                          }
                          if(p) that.defendingPlayer.takeDamage(i, p, true);
                        } else {*/
                        bs2[0].takeDamage(i, i.power, true);
                        //}
                    }
                    else {
                        // Unblocked. Deal damage.
                        that.defendingPlayer.takeDamage(i, i.power, true);
                    }
                    i.attacking = false; // Remove "attacker" status now that it is no longer needed
                }
                // Remove "blocker" status now that it is no longer needed
                for (let b of Battlefield.filter(x => x instanceof Creature)) {
                    b.blocking = [];
                }
            }
            else if (that.step == Step.draw) {
                that.currentPlayer.drawCard();
            }
        }, this);
    }
    advance(targetStep) {
        // Drain mana pools
        for (let p of this.playerList) {
            p.manaPool = ManaFromSymbols(p.manaPool.symbols.filter(x => x.keep));
        }
        // Advance to the next step
        let nextStep = this.stepList[this.stepIndex + 1];
        if (nextStep) {
            this.stepIndex++;
            this.step = nextStep;
            this.beginStep();
        }
        else {
            // Remove damage
            for (let i of Battlefield.filter(x => x instanceof Creature)) {
                i.removeDamage();
            }
            // Begin a new turn
            for (let p of this.playerList)
                p.manaPool = new Mana();
            for (let i of Battlefield.filter(x => x instanceof Creature)) {
                i.attacking = false;
            }
            this.currentPlayer =
                this.playerList[this.playerList.indexOf(this.currentPlayer) + 1 ==
                    this.playerList.length
                    ? 0
                    : this.playerList.indexOf(this.currentPlayer) + 1];
            // Set step to untap step
            this.stepIndex = 0;
            this.step = this.stepList[0];
            this.beginStep();
            // Delete temporary abilities
            for (let i of Battlefield) {
                i.tempAbilities = [];
            }
        }
        if (targetStep && this.step != targetStep)
            this.advance(targetStep);
    }
    get ongoingSelection() {
        return this.playerList.filter(x => x.selectionData).length > 0;
    }
    get selectingPlayer() {
        return this.playerList.filter(x => x.selectionData)[0];
    }
    get choosing() {
        return this.playerList.filter(x => x.choosing).length > 0;
    }
    get autoAdvance() {
        return [Step.untap, Step.cleanup, Step.deal_damage, Step.draw].includes(this.step);
    }
    advanceIfReady() {
        let that = TurnManager; // what the flurp?
        if (!that.playerList.length)
            return;
        if ((!that.endedPhase && !that.endedTurn && !that.autoAdvance) || StackManager.stack.length || that.choosing)
            return;
        if (that.endedTurn) {
            // End the turn
            that.advance(Step.untap);
            that.passedPriority = false;
            that.endedPhase = false;
            that.endedTurn = false;
        }
        else {
            // Advance one phase
            that.advance();
            that.passedPriority = false;
            that.endedPhase = false;
        }
        that.advanceIfReady();
    }
}
