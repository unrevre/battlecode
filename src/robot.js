import { BCAbstractRobot, SPECS } from 'battlecode';

const ring_three = [
    [0, -3], [1, -2], [2, -2], [2, -1],
    [3, 0], [2, 1], [2, 2], [1, 2],
    [0, 3], [-1, 2], [-2, 2], [-2, 1],
    [-3, 0], [-2, -1], [-2, -2], [-1, -2]];
const ring_two = [
    [0, -2], [1, -1], [2, 0], [1, 1],
    [0, 2], [-1, 1], [-2, 0], [-1, -1]];
const ring_one = [
    [0, -1], [1, 0], [0, 1], [-1, 0]];

const karbonite_costs = [0, 50, 10, 15, 25, 30];
const fuel_costs = [0, 200, 50, 50, 50, 50];

const vision_range = [100, 100, 100, 49, 64, 16];

const min_attack_range = [1, 0, 0, 1, 16, 1];
const max_attack_range = [64, 0, 0, 16, 64, 26];

const attack_damage = [10, 0, 0, 10, 10, 20];

let step = -1;

class MyRobot extends BCAbstractRobot {
    constructor() {
        super();

        this.compass = [
            [0, -1], [1, 0], [-1, 0], [0, 1],
            [-1, 1], [-1, -1], [1, -1], [1, 1]
        ];

        this.size = null;
        this.symmetry = null;

        this.castles = 0;
        this.mark = 0;
        this.tag = 0;

        this.castle_points = [];
        this.deposit_points = [];
        this.objectives = [];

        this.confirmation = {};

        this.objective = null;

        this.local_resources = [];

        this.unit_queue = [];
        this.signal_queue = [];

        this.messages = [];

        this.reserved = [0, 0];
        this.backlog = [0, 0];

        this.fountain = null;
        this.memory = null;
        this.victim = null;

        this.target = null;
        this.path = null;

        this.mode = 0;
        this.mission = 0;

        this.patience = 0;
    }

    turn() {
        step++;

        this.log('START TURN ' + step);

        if (step === 0) {
            this.size = this.map.length;
            this.symmetry = this.determine_map_symmetry();

            this.fountain = this.get_adjacent_deposit_point();
        }

        if (this.me.unit === SPECS.CASTLE) {
            this.log('Castle [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            if (step === 0) {
                // TODO: contingency for when no resources are found
                this.local_resources.push({
                    locations: this.get_local_resources(this.karbonite_map, 26),
                    occupied: [] });
                this.local_resources.push({
                    locations: this.get_local_resources(this.fuel_map, 26),
                    occupied: [] });

                let current = [this.me.x, this.me.y];
                this.castle_points.push(current);
                this.deposit_points.push(current);

                this.objective = this.reflect_about_symmetry_axis(
                    current.slice());
                this.objectives.push(this.objective);
            }

            if (this.patience === 1) { this.release_resources(); }
            if (this.patience > 0) { this.patience--; }

            let visibles = this.get_visible_robots();

            // check castle talk - abuse all information available
            let castling = this.filter_castling_robots(visibles);
            for (let i = 0; i < castling.length; i++) {
                let robot = castling[i];
                this.process_castle_talk(robot, robot.castle_talk);
            }

            if (step === 0) { this.mark = this.castles; }
            if (step === 2) {
                this.castles /= 2;
                for (let key in this.messages) {
                    let coordinates = this.messages[key];
                    this.castle_points.push(coordinates);
                    this.deposit_points.push(coordinates);
                    this.objectives.push(this.reflect_about_symmetry_axis(
                        coordinates.slice()));
                }

                this.messages.length = 0;
            }

            // clear castle talk by default
            this.castle_talk(0x00);

            // broadcast coordinates at the beginning of the game
            if (step === 0) { this.castle_talk(this.me.x); }
            if (step === 1) { this.castle_talk(this.me.y); }

            // check radioing units - team available for castles
            let radioing = this.filter_allied_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                this.signal_queue.push({
                    signal: robot.signal,
                    id: robot.id,
                    coordinates: [robot.x, robot.y]
                });
            }

            // handle radio signals
            // TODO: signals that require a signal response must be handled
            // only when the unit queue is empty
            let next_signal = this.signal_queue.shift();
            if (next_signal != undefined) {
                let message = this.decode_coordinates(next_signal.signal);
                // check coordinates
                let coordinates = message[0];
                let tag = message[2];
                if (tag === 2 && this.objectives.length > 1
                        && this.is_same_square(this.objective, coordinates)) {
                    this.castle_talk(this.mark + 0xF0);
                    this.update_objectives(this.mark);
                }
            }

            let allies = this.filter_armed_allied_robots(visibles);
            let enemies = this.filter_visible_enemy_robots(visibles);
            let attackables = this.filter_attackable_robots(enemies);
            let immediate = this.get_coordinates_of_closest_robot(enemies);

            let safety = this.appropriate_replacement(
                this.evaluate_castle_safety(visibles, enemies));

            switch (safety) {
                case 0:
                    this.consider_church_expansion();
                    break;
                case 1: {
                    let prey = this.get_attack_target_from(
                        attackables, [4, 5, 2, 3, 1, 0]);
                    if (prey != null) {
                        this.log('  - attack unit [' + prey.id + '], type ('
                            + prey.unit + ') at ' + prey.x + ', ' + prey.y);
                        return this.attack(prey.x - this.me.x,
                                           prey.y - this.me.y);
                    }
                    break;
                }
                case SPECS.CRUSADER:
                    this.release_reserves();
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.CRUSADER, null, immediate, 0);
                    this.restore_reserves();
                    break;
                case SPECS.PROPHET:
                    this.release_reserves();
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PROPHET, null, immediate, 0);
                    this.restore_reserves();
                    break;
                case SPECS.PREACHER:
                    this.release_reserves();
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PREACHER, immediate, immediate, 0);
                    this.restore_reserves();
                    break;
            }

            if (step > 750) {
                // check resources
                this.enqueue_unit(SPECS.CRUSADER,
                    this.objective, this.objective, 3);
            } else if (step > 900) {
                this.enqueue_unit(SPECS.PREACHER,
                    this.objective, this.objective, 3);
            }

            // queue pilgrims on all available local resources after clearing
            // initial build queue
            // TODO: check and replenish pilgrims occasionally if time allows
            for (let i = 0; i < 2; i++) {
                if (this.unit_queue.length === 0) {
                    let square = this.next_available_resource_from(
                        this.local_resources[i]);
                    if (square != null && this.enqueue_unit(
                            SPECS.PILGRIM, square, square, 0)) {
                        this.local_resources[i].occupied[square] = true; }
                }
            }

            if (this.is_available(100, 200) && this.unit_queue.length === 0) {
                this.enqueue_unit(SPECS.PROPHET, null, null, 0); }

            if (this.unit_queue.length > 0) {
                let unit = this.unit_queue.shift();

                let spawn = this.get_buildable_square_for(
                    unit.unit, unit.target, allies, enemies);
                if (spawn != null) {
                    if (unit.signal != null) {
                        this.signal(this.encode_coordinates(
                            unit.signal, this.mark, unit.tag), 2); }

                    this.log('  - build unit type [' + unit.unit + '] at ('
                        + spawn[0] + ', ' + spawn[1] + ')');
                    return this.build_unit(
                        unit.unit, spawn[0] - this.me.x, spawn[1] - this.me.y);
                }
            }
        }

        else if (this.me.unit === SPECS.CHURCH) {
            this.log('Church [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            let visibles = this.get_visible_robots();

            if (step === 0) {
                // TODO: contingency for when no resources are found
                this.local_resources.push({
                    locations: this.get_local_resources(this.karbonite_map, 26),
                    occupied: [] });
                this.local_resources.push({
                    locations: this.get_local_resources(this.fuel_map, 26),
                    occupied: [] });

                this.objective = this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]);
            }

            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                let message = this.decode_coordinates(robot.signal);
                if (step === 0 && robot.unit === SPECS.PILGRIM
                        && robot.signal_radius == 2
                        && robot.team === this.me.team) {
                    this.target = message[0];
                    this.mark = message[1];
                    this.memory = this.target;
                    this.local_resources[0].occupied[message[0]] = true;
                    break;
                } else if (message[2] === 1
                        && robot.signal_radius == this.distance_to_(robot)) {
                    this.mark = message[1];
                    let candidate = message[0];
                    if (this.is_resource(candidate, this.karbonite_map)) {
                        this.enqueue_unit(SPECS.PILGRIM,
                            candidate, candidate, 1); }
                }
            }

            if (step === 0 && this.distance_to(this.memory) > 16) {
                this.objective = this.memory; }

            // clear castle talk by default
            this.castle_talk(0x00);

            if (step === 0) { this.castle_talk(this.me.x + 0x80); }
            if (step === 1) { this.castle_talk(this.me.y + 0x80); }

            let allies = this.filter_armed_allied_robots(visibles);
            let enemies = this.filter_visible_enemy_robots(visibles);
            let immediate = this.get_coordinates_of_closest_robot(enemies);

            let safety = this.appropriate_replacement(
                this.evaluate_church_safety(visibles, enemies));

            switch (safety) {
                case 0:
                    this.consider_church_expansion();
                    break;
                case SPECS.CRUSADER:
                    this.release_reserves();
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.CRUSADER, null, immediate, 0);
                    this.restore_reserves();
                    break;
                case SPECS.PROPHET:
                    this.release_reserves();
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PROPHET, null, immediate, 0);
                    this.restore_reserves();
                    break;
                case SPECS.PREACHER:
                    this.release_reserves();
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PREACHER, immediate, immediate, 0);
                    this.restore_reserves();
                    break;
            }

            // TODO: decide units/target resource based on distribution of
            // resources
            for (let i = 0; i < 2; i++) {
                if (this.unit_queue.length === 0) {
                    let square = this.next_available_resource_from(
                        this.local_resources[i]);
                    if (square != null && this.enqueue_unit(
                            SPECS.PILGRIM, square, square, 0)) {
                        this.local_resources[i].occupied[square] = true; }
                }
            }

            if (this.unit_queue.length === 0) {
                if (Math.abs(this.me.x - this.size / 2) > 18
                        && this.is_available(200, 400)) {
                    this.enqueue_unit(SPECS.PROPHET, null, null, 0);
                } else if (this.is_available(110, 250)) {
                    this.enqueue_unit(SPECS.PROPHET, null, null, 0);
                }
            }

            if (this.unit_queue.length > 0) {
                let unit = this.unit_queue.shift();

                let spawn = this.get_buildable_square_for(
                    unit.unit, unit.target, allies, enemies);
                if (spawn != null) {
                    if (unit.signal != null) {
                        this.signal(this.encode_coordinates(
                            unit.signal, this.mark, unit.tag), 2); }

                    this.log('  - build unit type [' + unit.unit + '] at ('
                        + spawn[0] + ', ' + spawn[1] + ')');
                    return this.build_unit(
                        unit.unit, spawn[0] - this.me.x, spawn[1] - this.me.y);
                }
            }
        }

        else if (this.me.unit === SPECS.PILGRIM) {
            this.log('Pilgrim [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            let visibles = this.get_visible_robots();

            // listen to radio for instructions from the castle/church
            let radioing = this.filter_allied_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (robot.unit < 2 && robot.signal_radius == 2
                        && this.memory == null) {
                    let message = this.decode_coordinates(robot.signal);
                    this.target = message[0];
                    this.mark = message[1];
                    this.mission = message[2];
                    this.memory = this.target;
                    break;
                }
            }

            // on a church building mission
            if (step === 0 && this.mission === 1) {
                this.objective = this.get_optimal_square_by_adjacent_resources(
                    this.target);
                let path = this.reverse_raw_onion_search(
                    this.objective, [this.me.x, this.me.y],
                    this.get_two_raw_onion_rings_around.bind(this));
                this.target = path[path.length - 2];
                this.objective = this.target;
            }

            let enemies = this.filter_visible_enemy_robots(visibles);
            let attacking = this.filter_armed_robots(enemies);
            let attacking_units = this.group_by_unit_types(attacking);

            if (this.mission === 1 && enemies.length > 0
                    && this.is_safe(attacking)
                    && this.distance_to(this.memory) <= 100
                    && this.distance_to(this.fountain) > 49) {
                let nearest = this.get_closest_robot(enemies);
                if (this.is_visible_to(enemies)) {
                    if (enemies.length === 1 || (attacking.length < 3
                            && this.is_available(150, 300))) {
                        this.mode = 3;
                        this.target = [this.me.x, this.me.y];
                    } else if (nearest.turn - 20 > this.me.turn) {
                        this.castle_talk(0x0F);
                        this.mission = 0;
                        this.memory = null;
                        this.mode = 1;
                    }
                }
            }

            // clear target destination after arrival
            if (this.target != null && this.is_at(this.target)) {
                this.target = null;

                if (this.mission === 1
                        && this.get_distance_to_nearest_deposit_point(
                            visibles) > 15) {
                    let church = (!this.is_at(this.objective))
                        ? this.get_safe_buildable_square_closest_to(enemies)
                        : this.get_buildable_square_by_adjacent_resources();

                    if (church != null && this.karbonite >= 50
                            && this.fuel >= 200) {
                        this.signal(this.encode_coordinates(
                            this.memory, this.mark, 0), 2);
                        this.fountain = church;
                        if (this.distance_to(this.objective) < 9) {
                            this.target = this.memory;
                            this.mission = 0;
                        } else {
                            this.target = this.objective;
                        }
                        this.log('  - build unit type [1] at (' + church[0]
                            + ', ' + church[1] + ')');
                        return this.build_unit(SPECS.CHURCH,
                                               church[0] - this.me.x,
                                               church[1] - this.me.y);
                    }
                }
            }

            let attacked_count = 0;
            for (let i = 0; i < attacking.length; i++) {
                if (this.is_in_attack_range_of(attacking[i])) {
                    attacked_count++; } }

            if (attacked_count > 0) {
                this.mode = 1;
            } else if (attacking.length > 0) {
                if (attacking_units[SPECS.CRUSADER].length > 0) {
                    let old = this.get_closest_robot(
                        this.filter_older_robots(
                            attacking_units[SPECS.CRUSADER]));
                    let young = this.get_closest_robot(
                        this.filter_younger_robots(
                            attacking_units[SPECS.CRUSADER]));
                    if ((old != null && this.distance_to([old.x, old.y]) <= 20)
                            || (young != null && this.distance_to(
                                [young.x, young.y])) <= 40) {
                        this.mode = 1;
                    } else if (this.me.karbonite > 9 || this.me.fuel > 49) {
                        // trigger deposit if enemies are closing in
                        if (this.mode === 1) {
                            this.mode = 3;
                            this.target = [this.me.x, this.me.y];
                        } else {
                            this.mode = 2;
                        }
                    } else {
                        this.mode = 3;
                        this.target = [this.me.x, this.me.y];
                    }
                } else if (this.me.karbonite > 9 || this.me.fuel > 49) {
                    // trigger deposit if enemies are closing in
                    this.mode = 2;
                } else if (this.is_safe(attacking)) {
                    if (this.mode > 0) {
                        this.target = null;
                        this.mode = 0;
                    }
                }
            } else if (this.mode > 0) {
                this.target = null;
                this.mode = 0;
            }

            if (this.mode === 2
                    && this.is_adjacent_deposit_point(this.fountain)) {
                this.log('  - depositing resources [emergency]');
                return this.give(this.fountain[0] - this.me.x,
                                 this.fountain[1] - this.me.y,
                                 this.me.karbonite, this.me.fuel);
            }

            if (this.mode === 1) {
                this.target = this.evade_threat_from(
                    this.get_threat_direction_from(attacking)); }

            if (this.target == null && this.mission === 1
                    && this.objective != null) {
                this.target = this.objective; }

            // mine resources if safe and appropriate
            // TODO: deposit resources more frequently when necessary so that
            // units may be built earlier
            if (this.target == null) {
                if (this.is_on_resource(this.karbonite_map)
                        && this.me.karbonite < 19) {
                    this.log('  - mining karbonite');
                    return this.mine();
                }

                if (this.is_on_resource(this.fuel_map) && this.me.fuel < 91) {
                    this.log('  - mining fuel');
                    return this.mine();
                }
            }

            // deposit resources
            if (this.is_adjacent_deposit_point(this.fountain)
                    && (this.me.karbonite || this.me.fuel)) {
                this.target = null;
                this.log('  - depositing resources');
                return this.give(this.fountain[0] - this.me.x,
                                 this.fountain[1] - this.me.y,
                                 this.me.karbonite, this.me.fuel);
            }

            // return to nearest resource deposit point
            if (this.mode === 0
                    && (this.me.karbonite > 18 || this.me.fuel > 90)) {
                this.target = this.fountain; }

            // target remembered resource after any interruption (deposition,
            // evasion, church building etc..)
            if (this.target == null && this.memory != null) {
                this.target = this.memory; }

            this.log('  target: ' + this.target);

            this.path = this.get_pilgrimage_path_to(this.target);

            if (this.path != null && this.path.length > 0) {
                let destination = this.path[1];

                // don't move into attack range of enemies
                // TODO: route around enemy attack range to destination
                if (this.is_square_safe(destination, attacking)) {
                    this.log('  - moving to destination: ('
                        + destination[0] + ', ' + destination[1] + ')');
                    return this.move(destination[0] - this.me.x,
                                     destination[1] - this.me.y);
                }
            }
        }

        else if (this.me.unit === SPECS.CRUSADER) {
            this.log('Crusader [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            let visibles = this.get_visible_robots();

            // listen to radio for instructions
            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (this.is_robot_at(robot, this.fountain)) {
                    let signal = this.decode_coordinates(robot.signal);
                    this.memory = signal[0];
                    this.mark = signal[1];
                    this.tag = signal[2];
                    this.target = this.memory;
                    break;
                }
            }

            // TODO: overhaul attack targeting system
            let enemies = this.filter_visible_enemy_robots(visibles);

            // castle destruction confirmation
            if (this.memory != null && this.distance_to(this.memory) < 50
                    && this.tag === 0x3) {
                let castle_presence = null;
                for (let i = 0; i < enemies.length; i++) {
                    if (enemies[i].unit === 0) {
                        castle_presence = enemies[i];
                        break;
                    }
                }

                if (castle_presence == null) {
                    let message = this.encode_coordinates(
                        this.memory, this.mark, 2);
                    this.signal(message, this.distance_to(this.fountain));
                }
            }

            // clear target after arrival
            if (this.target != null && this.is_at(this.target)) {
                this.target = null; }

            if (this.target != null && this.is_allied_unit_at(this.target)) {
                this.target = null; }

            // start with victim (target to focus) - this usually is either the
            // last enemy attacked, or the castle
            if (this.victim != null && this.is_alive(this.victim)
                    && this.is_in_attack_range(this.victim)) {
                this.log('  - attack unit [' + this.victim.id
                    + '], type (' + this.victim.unit + ') at '
                    + this.victim.x + ', ' + this.victim.y);
                return this.attack(this.victim.x - this.me.x,
                                   this.victim.y - this.me.y);
            }

            let attackables = this.filter_attackable_robots(enemies);
            let prey = this.get_attack_target_from(attackables,
                                                   [2, 0, 4, 5, 3, 1]);

            if (prey != null) {
                this.victim = prey;
                this.log('  - attack unit [' + prey.id + '], type ('
                    + prey.unit + ') at ' + prey.x + ', ' + prey.y);
                return this.attack(prey.x - this.me.x, prey.y - this.me.y);
            }

            // advance towards enemy
            if (this.target == null && enemies.length > 0) {
                this.target = this.get_coordinates_of_closest_robot(enemies); }

            // move off buildable squares, resources
            if (this.target == null && (this.is_adjacent(this.fountain)
                    || this.is_on_any_resource())) {
                this.target = this.get_closest_square(
                    this.get_next_to_adjacent_passable_empty_squares_at(
                        this.fountain)); }

            // TODO: fuzzy target destinations to surround enemies properly
            // TODO: wrap around defenders (if possible) to attack castle
            // TODO: consider using pilgrims for vision

            this.path = this.get_path_to(
                this.get_crusader_target_for(this.target, enemies),
                this.get_three_onion_rings_around.bind(this));

            this.log('  target: ' + this.target);

            if (this.path != null && this.path.length > 0) {
                let destination = this.path[1];
                this.log('  - moving to destination: (' + destination[0] + ', '
                    + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }

        else if (this.me.unit === SPECS.PROPHET) {
            this.log('Prophet [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            let visibles = this.get_visible_robots();

            // listen to radio for instructions
            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (this.is_robot_at(robot, this.fountain)) {
                    let signal = this.decode_coordinates(robot.signal);
                    this.memory = signal[0];
                    this.mark = signal[1];
                    this.tag = signal[2];
                    this.target = this.memory;
                    break;
                }
            }

            // TODO: prophets generally should seek out choke points or cover
            // behind friend units and remain stationary

            // start with victim (target to focus) - this usually is either the
            // last enemy attacked, or the castle
            if (this.victim != null && this.is_alive(this.victim)
                    && this.is_in_attack_range(this.victim)) {
                this.log('  - attack unit [' + this.victim.id
                    + '], type (' + this.victim.unit + ') at '
                    + this.victim.x + ', ' + this.victim.y);
                return this.attack(this.victim.x - this.me.x,
                                   this.victim.y - this.me.y);
            }

            let enemies = this.filter_visible_enemy_robots(visibles);
            let attackables = this.filter_attackable_robots(enemies);

            let prey = this.get_attack_target_from(attackables,
                                                   [4, 5, 2, 0, 3, 1]);
            if (prey != null) {
                this.log('  - attack unit [' + prey.id + '], type ('
                    + prey.unit + ') at ' + prey.x + ', ' + prey.y);
                return this.attack(prey.x - this.me.x, prey.y - this.me.y);
            }

            if (this.mode > 0 && enemies.length === 0) {
                this.mode = 0;
                this.target = this.memory;
            }

            // clear target after arrival
            if (this.target != null && this.is_at(this.target)) {
                this.target = null; }

            if (this.target != null && this.is_allied_unit_at(this.target)) {
                this.target = null; }

            // move off buildable squares, resources
            if (this.target == null && (this.is_adjacent(this.fountain)
                    || this.is_on_any_resource()
                    || !this.is_on_lattice_point())) {
                this.target = this.get_next_lattice_point(); }

            if (enemies.length > 0) {
                this.mode = 1;
                let nearest = this.get_closest_robot(enemies);
                this.target = this.evade_threat_from(
                    this.get_aligned_compass_direction_from(
                        [nearest.x - this.me.x, nearest.y - this.me.y]));
            }

            // deposit resources if convenient
            if (this.target == null) {
                if (this.is_adjacent(this.fountain)
                        && (this.me.karbonite || this.me.fuel)) {
                    this.log('  - depositing resources [emergency]');
                    return this.give(this.fountain[0] - this.me.x,
                                     this.fountain[1] - this.me.y,
                                     this.me.karbonite, this.me.fuel);

                }

                // TODO: implement daisy chaining resources back to base
            }

            this.path = this.get_path_to(
                this.target, this.get_two_onion_rings_around.bind(this));

            this.log('  target: ' + this.target);

            if (this.path != null && this.path.length > 0) {
                let destination = this.path[1];
                this.log('  - moving to destination: (' + destination[0] + ', '
                    + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }

        else if (this.me.unit === SPECS.PREACHER) {
            this.log('Preacher [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            let visibles = this.get_visible_robots();

            // listen to radio for instructions
            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (this.is_robot_at(robot, this.fountain)) {
                    let signal = this.decode_coordinates(robot.signal);
                    this.memory = signal[0];
                    this.mark = signal[1];
                    this.tag = signal[2];
                    this.target = this.memory;
                    break;
                }
            }

            let enemies = this.filter_visible_enemy_robots(visibles);

            if (enemies.length > 0) {
                let point = this.get_splash_attack();
                if (point != null) {
                    this.log('  - attack ' + point[0] + ', ' + point[1]);
                    return this.attack(point[0] - this.me.x,
                                       point[1] - this.me.y);
                }
            }

            // don't stray too far
            if (this.target != null && this.distance_to(this.target) < 5) {
                this.target = null; }

            // clear target after arrival
            if (this.target != null && this.is_at(this.target)) {
                this.target = null; }

            if (this.target == null && (this.is_adjacent(this.fountain)
                    || this.is_on_any_resource())) {
                // move off buildable squares, resources
                // TODO: move in current direction away from fountain
                this.target = this.get_closest_square(
                    this.get_next_to_adjacent_passable_empty_squares_at(
                        this.fountain)); }

            // deposit resources if convenient
            if (this.target == null) {
                if (this.is_adjacent(this.fountain)
                        && (this.me.karbonite || this.me.fuel)) {
                    this.log('  - depositing resources [emergency]');
                    return this.give(this.fountain[0] - this.me.x,
                                     this.fountain[1] - this.me.y,
                                     this.me.karbonite, this.me.fuel);
                }

                // TODO: implement daisy chaining resources back to base
            }

            this.path = this.get_path_to(
                this.get_preacher_target_for(this.target, enemies),
                this.get_two_onion_rings_around.bind(this));

            this.log('  target: ' + this.target);

            if (this.path != null && this.path.length > 0) {
                let destination = this.path[1];
                this.log('  - moving to destination: (' + destination[0] + ', '
                    + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }
    }

    /*
     * wrappers
     */

    build_unit(unit, dx, dy) {
        return this.buildUnit(unit, dx, dy);
    }

    castle_talk(value) {
        return this.castleTalk(value);
    }

    get_visible_robots() {
        return this.getVisibleRobots();
    }

    get_visible_robot_map() {
        return this.getVisibleRobotMap();
    }

    get_robot(id) {
        return this.getRobot(id);
    }

    is_visible(robot) {
        return this.isVisible(robot);
    }

    is_radioing(robot) {
        return this.isRadioing(robot);
    }

    get_passable_map() {
        return this.getPassableMap();
    }

    /*
     * symmetry
     */

    determine_map_symmetry() {
        let karbonite_map = this.karbonite_map;
        let karbonite_coords = this.get_resources(karbonite_map);

        for (let i = 0; i < karbonite_coords.length; i++) {
            let coord = karbonite_coords[i];
            if (karbonite_map[coord[1]][this.size - 1 - coord[0]]
                    && !(karbonite_map[this.size - 1 - coord[1]][coord[0]])) {
                return 0;
            } else if (!(karbonite_map[coord[1]][this.size - 1 - coord[0]])
                    && karbonite_map[this.size - 1 - coord[1]][coord[0]]) {
                return 1;
            }
        }

        // TODO: full map symmetry scan

        this.log('WARNING: map symmetry not determined');
        return null;
    }

    reflect_about_symmetry_axis(square) {
        square[this.symmetry] = this.size - 1 - square[this.symmetry];

        return square;
    }

    /*
     * map
     */

    is_at(square) {
        return this.me.x === square[0] && this.me.y === square[1];
    }

    is_same_square(square, target) {
        return square[0] === target[0] && square[1] === target[1];
    }

    is_out_of_bounds(square) {
        let x = square[0];
        let y = square[1];

        return (x < 0 || x >= this.size || y < 0 || y >= this.size);
    }

    is_square_visible(square) {
        return this.distance_to(square) < vision_range[this.me.unit];
    }

    is_passable(square) {
        let x = square[0];
        let y = square[1];

        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            return false; }

        return this.map[y][x];
    }

    is_empty(square) {
        let nonempty = this.get_visible_robot_map();

        return nonempty[square[1]][square[0]] < 1;
    }

    is_passable_and_empty(square) {
        let x = square[0];
        let y = square[1];

        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            return false; }

        let nonempty = this.get_visible_robot_map();

        return this.map[y][x] && (nonempty[y][x] < 1);
    }

    is_adjacent(square) {
        return (this.distance_to(square) < 3);
    }

    are_adjacent(square, target) {
        return (this.distance(square, target) < 3);
    }

    is_adjacent_deposit_point(square) {
        if (square == null || !this.is_adjacent(square)) { return false; }

        let robot_id = this.get_visible_robot_map()[square[1]][square[0]];
        if (robot_id < 1) { return false; }

        return (this.get_robot(robot_id).unit < 2);
    }

    is_buildable(square) {
        return this.is_passable_and_empty(square);
    }

    is_on_lattice_point() {
        return (this.me.x + this.me.y) % 2 === 0;
    }

    count_adjacent_impassable_squares_around(square) {
        return 8 - this.get_adjacent_passable_squares_at(square).length;
    }

    get_adjacent_deposit_point() {
        let visibles = this.get_visible_robots();
        for (let i = 0; i < visibles.length; i++) {
            if (visibles[i].unit < 2 && visibles[i].team === this.me.team) {
                if (this.is_adjacent([visibles[i].x, visibles[i].y])) {
                    return [visibles[i].x, visibles[i].y]; } } }

        return null;
    }

    get_adjacent_passable_squares() {
        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let adjx = this.me.x + this.compass[i][0];
            let adjy = this.me.y + this.compass[i][1];
            if (this.is_passable([adjx, adjy])) {
                adjacent.push([adjx, adjy]); }
        }

        return adjacent;
    }

    get_adjacent_passable_empty_squares() {
        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let adjx = this.me.x + this.compass[i][0];
            let adjy = this.me.y + this.compass[i][1];
            if (this.is_passable_and_empty([adjx, adjy])) {
                adjacent.push([adjx, adjy]); }
        }

        return adjacent;
    }

    get_adjacent_passable_squares_at(square) {
        let x = square[0];
        let y = square[1];

        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let adjx = x + this.compass[i][0];
            let adjy = y + this.compass[i][1];
            if (this.is_passable([adjx, adjy])) {
                adjacent.push([adjx, adjy]); }
        }

        return adjacent;
    }

    get_adjacent_passable_empty_squares_at(square) {
        let x = square[0];
        let y = square[1];

        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let adjx = x + this.compass[i][0];
            let adjy = y + this.compass[i][1];
            if (this.is_passable_and_empty([adjx, adjy])) {
                adjacent.push([adjx, adjy]); }
        }

        return adjacent;
    }

    get_next_to_adjacent_passable_empty_squares_at(square) {
        const next_to_adjacent_directions = [
            [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
            [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1],
            [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2]];

        let x = square[0];
        let y = square[1];

        let next_to_adjacent = [];

        for (let i = 0; i < 16; i++) {
            let adjx = x + next_to_adjacent_directions[i][0];
            let adjy = y + next_to_adjacent_directions[i][1];
            if (this.is_passable_and_empty([adjx, adjy])) {
                next_to_adjacent.push([adjx, adjy]); }
        }

        return next_to_adjacent;
    }

    get_buildable_squares() {
        return this.get_adjacent_passable_empty_squares();
    }

    get_aligned_compass_direction_from(vector) {
        let x = vector[0];
        let y = vector[1];

        let max = Math.max(Math.abs(x), Math.abs(y));
        if (max === 0) { return [0, 0]; }

        return [Math.round(x / max), Math.round(y / max)];
    }

    get_adjacent_lattice_point() {
        let position = [this.me.x, this.me.y];

        if (!this.is_on_lattice_point()) {
            position[this.symmetry]
                += (position[this.symmetry] > ((this.size - 1) / 2)) ? -1 : 1; }

        return position;
    }

    /*
     * metric/distance
     */

    metric(r, s) {
        return Math.max(Math.abs(r[0] - s[0]), Math.abs(r[1] - s[1]));
    }

    metric_to(s) {
        return Math.max(Math.abs(this.me.x - s[0]), Math.abs(this.me.y - s[1]));
    }

    distance(r, s) {
        return (r[0] - s[0]) * (r[0] - s[0]) + (r[1] - s[1]) * (r[1] - s[1]);
    }

    distance_to(s) {
        return (this.me.x - s[0]) * (this.me.x - s[0])
            + (this.me.y - s[1]) * (this.me.y - s[1]);
    }

    get_closest_distance(target, squares) {
        if (squares.length === 0) { return null; }

        let minimum = 16384;
        for (let i = 0; i < squares.length; i++) {
            let distance = this.distance(target, squares[i]);
            if (distance < minimum) {
                minimum = distance; }
        }

        return minimum;
    }

    get_closest_square(squares) {
        if (squares.length === 0) { return null; }

        let index = 0;
        let minimum = 16384;
        for (let i = 0; i < squares.length; i++) {
            let distance = this.distance_to(squares[i]);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return squares[index];
    }

    get_closest_square_to(target, squares) {
        // assume squares has nonzero length

        let index = 0;
        let minimum = 16384;
        for (let i = 0; i < squares.length; i++) {
            let distance = this.distance(squares[i], target);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return squares[index];
    }

    get_closest_squares_to(target, squares) {
        // assume squares has nonzero length
        let closest = [];

        let minimum = 16384;
        for (let i = 0; i < squares.length; i++) {
            let distance = this.distance(squares[i], target);
            if (distance < minimum) {
                minimum = distance;
                closest.length = 0;
                closest.push(squares[i]);
            } else if (distance === minimum) {
                closest.push(squares[i]);
            }
        }

        return closest;
    }

    index_of_closest_square_to(target, squares) {
        let index = 0;
        let minimum = 16384;
        for (let i = 0; i < squares.length; i++) {
            let distance = this.distance(target, squares[i]);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return index;
    }

    /*
     * resources
     */

    is_on_resource(resource_map) {
        return resource_map[this.me.y][this.me.x];
    }

    is_on_any_resource() {
        return this.karbonite_map[this.me.y][this.me.x]
            || this.fuel_map[this.me.y][this.me.x];
    }

    is_resource(square, resource_map) {
        return resource_map[square[1]][square[0]];
    }

    is_any_resource(square) {
        return this.karbonite_map[square[1]][square[0]]
            || this.fuel_map[square[1]][square[0]];
    }

    get_resources(resource_map) {
        let resources = [];

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (resource_map[i][j]) {
                    resources.push([j, i]); } } }

        return resources;
    }

    get_local_resources(resource_map, radius) {
        return this.order_by_onion_path_length(
            this.filter_by_distance_less_than(
                this.get_resources(resource_map), radius));
    }

    score_resource_squares_around(square) {
        let adjacent = this.get_adjacent_passable_squares_at(square);

        let score = 0;
        for (let i = 0; i < adjacent.length; i++) {
            if (this.is_resource(adjacent[i], this.karbonite_map)) {
                score += 1.1; }
            if (this.is_resource(adjacent[i], this.fuel_map)) {
                score += 1; }
        }

        return score;
    }

    next_available_resource_from(resource) {
        for (let i = 0; i < resource.locations.length; i++) {
            if (!resource.occupied[resource.locations[i]]) {
                return resource.locations[i]; } }

        return null;
    }

    is_available(karbonite, fuel) {
        return (this.karbonite - this.reserved[0] >= karbonite
            && this.fuel - this.reserved[1] >= fuel);
    }

    reserve_resources(karbonite, fuel) {
        this.reserved[0] += karbonite;
        this.reserved[1] += fuel;
    }

    free_resources(karbonite, fuel) {
        this.reserved[0] -= karbonite;
        this.reserved[1] -= fuel;

        this.reserved[0] = Math.max(0, this.reserved[0]);
        this.reserved[1] = Math.max(0, this.reserved[1]);
    }

    release_resources() {
        this.reserved = [0, 0];
    }

    release_reserves() {
        this.backlog[0] = this.reserved[0];
        this.backlog[1] = this.reserved[1];

        this.reserved = [0, 0];
    }

    restore_reserves() {
        this.reserved[0] = this.backlog[0];
        this.reserved[1] = this.backlog[1];

        this.backlog = [0, 0];
    }

    /*
     * unit queue
     */

    enqueue_unit(unit, signal, target, tag) {
        // FIXME: signals fuel cost not taken into account
        if (this.is_available(karbonite_costs[unit], fuel_costs[unit])) {
            this.unit_queue.push({
                unit: unit,
                signal: signal,
                target: target,
                tag: tag
            });

            return true;
        }

        return false;
    }

    /*
     * pathing
     */

    breadth_first_search(point, directions, compass) {
        let head = point;

        let open = [];
        let closed = [];

        while (!this.is_passable_and_empty(head)) {
            directions.reverse();
            for (let i = 0; i < directions.length; i++) {
                let next = [head[0] + directions[i][0],
                            head[1] + directions[i][1]];
                if (next in closed) { continue; }

                closed[next] = 0;
                open.push(next);
            }

            head = open.shift();

            if (this.is_out_of_bounds(head)
                    && this.is_out_of_bounds([head[0] + compass[0],
                                              head[1] + compass[1]])) {
                directions = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
            }
        }

        return head;
    }

    get_two_onion_rings_around(square) {
        let x = square[0];
        let y = square[1];

        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let rngx = x + ring_two[i][0];
            let rngy = y + ring_two[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        for (let i = 0; i < 4; i++) {
            let rngx = x + ring_one[i][0];
            let rngy = y + ring_one[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        return adjacent;
    }

    get_two_raw_onion_rings_around(square) {
        let x = square[0];
        let y = square[1];

        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let rngx = x + ring_two[i][0];
            let rngy = y + ring_two[i][1];
            if (this.is_passable([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        for (let i = 0; i < 4; i++) {
            let rngx = x + ring_one[i][0];
            let rngy = y + ring_one[i][1];
            if (this.is_passable([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        return adjacent;
    }

    get_three_onion_rings_around(square) {
        let x = square[0];
        let y = square[1];

        let adjacent = [];

        for (let i = 0; i < 16; i++) {
            let rngx = x + ring_three[i][0];
            let rngy = y + ring_three[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        for (let i = 0; i < 8; i++) {
            let rngx = x + ring_two[i][0];
            let rngy = y + ring_two[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        for (let i = 0; i < 4; i++) {
            let rngx = x + ring_one[i][0];
            let rngy = y + ring_one[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        return adjacent;
    }

    get_three_raw_onion_rings_around(square) {
        let x = square[0];
        let y = square[1];

        let adjacent = [];

        for (let i = 0; i < 16; i++) {
            let rngx = x + ring_three[i][0];
            let rngy = y + ring_three[i][1];
            if (this.is_passable([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        for (let i = 0; i < 8; i++) {
            let rngx = x + ring_two[i][0];
            let rngy = y + ring_two[i][1];
            if (this.is_passable([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        for (let i = 0; i < 4; i++) {
            let rngx = x + ring_one[i][0];
            let rngy = y + ring_one[i][1];
            if (this.is_passable([rngx, rngy])) {
                adjacent.push([rngx, rngy]); }
        }

        return adjacent;
    }

    pop(heap) {
        if (!heap.list.length) { return null; }

        if (heap.list.length === 1) { return heap.list.shift(); }

        let min = heap.list[0];
        heap.list[0] = heap.list.pop();
        heapify(heap, 0);
        return min;
    }

    insert(heap, cell) {
        let i = heap.list.length;
        heap.list.push(cell);
        let parent_index = parent_of(i);
        while (parent_index !== null
                && compare(heap.list[i], heap.list[parent_index]) < 0) {
            swap(heap.list, i, parent_index);
            i = parent_index;
            parent_index = parent_of(i);
        }
        return cell;
    }

    empty(heap) {
        return !heap.list.length;
    }

    onion_search(start, end, layering) {
        let node_map = [];
        for (let i = 0; i < this.size; i++) {
            node_map[i] = [];
            for (let j = 0; j < this.size; j++) {
                node_map[i][j] = {
                    key: [j, i],
                    f: 0,
                    g: 0,
                    closed: false,
                    trace: null
                };
            }
        }

        let node_heap = { list: [] };

        node_map[start[1]][start[0]].f = this.metric(start, end);
        this.insert(node_heap, node_map[start[1]][start[0]]);

        while (!this.empty(node_heap)) {
            let node = this.pop(node_heap);
            let head = node.key;

            if (head[0] === end[0] && head[1] === end[1]) {
                let path = [end];
                while (node.trace != null) {
                    node = node.trace;
                    path.push(node.key);
                }
                path.reverse();
                return path;
            }

            node.closed = true;

            let adjacent = layering(head);
            for (let i = 0; i < adjacent.length; i++) {
                let square = adjacent[i];
                let object = node_map[square[1]][square[0]];
                if (object.closed === true) { continue; }

                let total = node.g + this.metric(head, square) + 0.01;

                if (object.f != 0 && total >= object.g) { continue; }

                object.trace = node;
                object.g = total;
                object.f = total + this.metric(square, end);
                this.insert(node_heap, object);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    reverse_raw_onion_search(start, end, layering) {
        let node_map = [];
        for (let i = 0; i < this.size; i++) {
            node_map[i] = [];
            for (let j = 0; j < this.size; j++) {
                node_map[i][j] = {
                    key: [j, i],
                    f: 0,
                    g: 0,
                    closed: false,
                    trace: null
                };
            }
        }

        let node_heap = { list: [] };

        let node = node_map[start[1]][start[0]];
        node.f = this.metric(start, end);
        node.closed = true;

        let head = node.key;

        let adjacent = this.get_adjacent_passable_empty_squares_at(head);
        for (let i = 0; i < adjacent.length; i++) {
            let target = adjacent[i];
            let cell = node_map[target[1]][target[0]];
            if (cell.closed === true) { continue; }

            let total = node.g + this.metric(head, target) + 0.01;

            if (cell.f != 0 && total >= cell.g) { continue; }

            cell.trace = node;
            cell.g = total;
            cell.f = total + this.metric(target, end);
            this.insert(node_heap, cell);
        }

        while (!this.empty(node_heap)) {
            node = this.pop(node_heap);
            head = node.key;

            if (head[0] === end[0] && head[1] === end[1]) {
                let path = [end];
                while (node.trace != null) {
                    node = node.trace;
                    path.push(node.key);
                }
                return path;
            }

            node.closed = true;

            let adjacent = layering(head);
            for (let i = 0; i < adjacent.length; i++) {
                let square = adjacent[i];
                let object = node_map[square[1]][square[0]];

                if ((square[0] !== end[0] || square[1] !== end[1])
                        && !this.is_empty(square)) { continue; }

                if (object.closed === true) { continue; }

                let total = node.g + this.metric(head, square) + 0.01;

                if (object.f != 0 && total >= object.g) { continue; }

                object.trace = node;
                object.g = total;
                object.f = total + this.metric(square, end);
                this.insert(node_heap, object);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    reverse_fresh_onion_search(start, end, layering) {
        let node_map = [];
        for (let i = 0; i < this.size; i++) {
            node_map[i] = [];
            for (let j = 0; j < this.size; j++) {
                node_map[i][j] = {
                    key: [j, i],
                    f: 0,
                    g: 0,
                    closed: false,
                    trace: null
                };
            }
        }

        let node_heap = { list: [] };

        let node = node_map[start[1]][start[0]];
        node.f = this.metric(start, end);
        node.closed = true;

        let head = node.key;

        let adjacent = this.get_adjacent_passable_squares_at(head);
        for (let i = 0; i < adjacent.length; i++) {
            let target = adjacent[i];
            let cell = node_map[target[1]][target[0]];
            if (cell.closed === true) { continue; }

            let total = node.g + this.metric(head, target) + 0.01;

            if (cell.f != 0 && total >= cell.g) { continue; }

            cell.trace = node;
            cell.g = total;
            cell.f = total + this.metric(target, end);
            this.insert(node_heap, cell);
        }

        while (!this.empty(node_heap)) {
            node = this.pop(node_heap);
            head = node.key;

            if (head[0] === end[0] && head[1] === end[1]) {
                let path = [end];
                while (node.trace != null) {
                    node = node.trace;
                    path.push(node.key);
                }
                return path;
            }

            node.closed = true;

            let adjacent = layering(head);
            for (let i = 0; i < adjacent.length; i++) {
                let square = adjacent[i];
                let object = node_map[square[1]][square[0]];

                if (object.closed === true) { continue; }

                let total = node.g + this.metric(head, square) + 0.01;

                if (object.f != 0 && total >= object.g) { continue; }

                object.trace = node;
                object.g = total;
                object.f = total + this.metric(square, end);
                this.insert(node_heap, object);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    order_by_onion_path_length(squares) {
        let paths = [];
        for (let i = 0; i < squares.length; i++) {
            paths.push(this.onion_search(
                [this.me.x, this.me.y], squares[i],
                this.get_two_raw_onion_rings_around.bind(this))); }

        paths.sort(function(r, s) { return r.length - s.length; });

        let ordered = [];

        for (let i = 0; i < paths.length; i++) {
            ordered.push(paths[i][paths[i].length - 1]); }

        return ordered;
    }

    /*
     * high-level optimisations
     */

    get_safe_buildable_square_closest_to(enemies) {
        let adjacent = this.get_buildable_squares();
        if (adjacent.length === 0) { return null; }

        let safe = this.filter_safe_squares(adjacent, enemies);
        if (safe.length === 0) { return null; }

        let nearest = this.get_closest_robot(enemies);
        if (nearest == null) { return null; }
        let target = [nearest.x, nearest.y];

        let distance = [];
        for (let i = 0; i < safe.length; i++) {
            let square = safe[i];
            distance.push(this.distance(square, target));
        }

        return adjacent[this.index_of_minimum_element_in(distance)];
    }

    get_buildable_square_for(unit, target, allies, enemies) {
        let adjacent = this.get_buildable_squares();
        if (adjacent.length === 0) { return null; }

        if (unit === SPECS.PILGRIM) {
            return this.get_buildable_square_closest_to(target, adjacent);
        } else {
            if (target == null) {
                return this.get_defensive_buildable_square(allies, adjacent);
            } else {
                return this.get_offensive_buildable_square(
                    unit, target, adjacent, enemies);
            }
        }
    }

    get_buildable_square_closest_to(target, adjacent) {
        if (!this.is_passable(target) || this.distance_to(target) > 400) {
            return this.get_closest_square_to(target, adjacent); }

        let steps = [];
        for (let i = 0; i < adjacent.length; i++) {
            let square = adjacent[i];
            if (this.is_same_square(square, target)) {
                return target; }

            steps.push(this.reverse_fresh_onion_search(square, target,
                this.get_two_raw_onion_rings_around.bind(this)).length);
        }

        return adjacent[this.index_of_minimum_element_in(steps)];
    }

    get_defensive_buildable_square(allies, adjacent) {
        let direction = this.get_aligned_compass_direction_from(
            (allies.length < 10)
                ? this.get_vector_sum_of_metric_weighted_directions(allies)
                : [this.objective[0] - this.me.x,
                   this.objective[1] - this.me.y]);

        return this.get_buildable_square_closest_to(
            [this.me.x + direction[0], this.me.y + direction[1]], adjacent);
    }

    get_offensive_buildable_square(unit, target, adjacent, enemies) {
        if (!this.is_square_visible(target)) {
            return this.get_buildable_square_closest_to(target, adjacent); }

        let candidates = [];
        for (let i = 0; i < adjacent.length; i++) {
            let square = adjacent[i];
            if (this.is_unit_on_square_able_to_attack(unit, square, target)) {
                candidates.push(square); }
        }

        if (candidates.length === 0) {
            return this.get_closest_square_to(target, adjacent); }

        let predamage = [];
        for (let i = 0; i < candidates.length; i++) {
            predamage.push(this.total_damage_from(
                this.filter_younger_robots_attacking_square(
                    candidates[i], enemies))); }

        return candidates[this.index_of_minimum_element_in(predamage)];
    }

    get_optimal_square_by_adjacent_resources(square) {
        let maximum = -128;
        let optimal = square;

        let x = square[0];
        let y = square[1];

        for (let i = -2; i < 3; i++) {
            for (let j = -2; j < 3; j++) {
                let head = [x + i, y + j];
                if (!this.is_passable(head)) { continue; }

                let score = this.score_resource_squares_around(head) * 10
                    - this.count_adjacent_impassable_squares_around(head)
                    - 0.01 * Math.abs(((this.size - 1) / 2)
                        - head[this.symmetry]);
                if (this.is_any_resource(head)) { score -= 30; }

                if (score > maximum) {
                    maximum = score;
                    optimal = head;
                }
            }
        }

        return optimal;
    }

    get_buildable_square_by_adjacent_resources() {
        let adjacent = this.get_buildable_squares();
        if (adjacent.length === 0) { return null; }

        let scores = [];
        for (let i = 0; i < adjacent.length; i++) {
            let square = adjacent[i];
            let score = this.score_resource_squares_around(square) * 10
                - this.count_adjacent_impassable_squares_around(square);
            if (this.is_any_resource(square)) { score -= 30; }

            scores.push(score);
        }

        return adjacent[this.index_of_maximum_element_in(scores)];
    }

    get_pilgrimage_path_to(target) {
        if (target == null || this.is_at(target)) { return null; }

        if (this.is_same_square(target, this.fountain)) {
            return this.reverse_raw_onion_search(
                this.fountain, [this.me.x, this.me.y],
                this.get_two_raw_onion_rings_around.bind(this)); }

        let final_target = this.adjust_target_for_obstructions(target);
        if (final_target != null) {
            return this.onion_search([this.me.x, this.me.y], final_target,
                this.get_two_onion_rings_around.bind(this)); }

        return null;
    }

    adjust_target_for_obstructions(target) {
        // assume target is never null
        if (this.is_passable_and_empty(target)) { return target; }

        if (this.is_adjacent(target)) { return null; }

        let adjacent = this.get_adjacent_passable_empty_squares_at(target);
        let closest = this.get_closest_square(adjacent);
        if (closest != null) { return closest; }

        return this.get_closest_square(
            this.get_next_to_adjacent_passable_empty_squares_at(target));
    }

    get_vector_sum_of_metric_weighted_directions(robots) {
        let vector_x = 0;
        let vector_y = 0;

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            let separation = this.metric_to([robot.x, robot.y]);
            vector_x += (this.me.x - robot.x) * separation;
            vector_y += (this.me.y - robot.y) * separation;
        }

        return [vector_x, vector_y];
    }

    get_threat_direction_from(enemies) {
        let threat_x = 0;
        let threat_y = 0;

        for (let i = 0; i < enemies.length; i++) {
            let enemy = enemies[i];
            let separation = this.distance_to([enemy.x, enemy.y]);
            threat_x += (this.me.x - enemy.x) / separation;
            threat_y += (this.me.y - enemy.y) / separation;
        }

        let max = Math.max(Math.abs(threat_x), Math.abs(threat_y));
        threat_x = Math.round(threat_x * 4 / max);
        threat_y = Math.round(threat_y * 4 / max);

        if (threat_x == null && threat_y == null) {
            return [0, 0]; }

        return [threat_x, threat_y];
    }

    evade_threat_from(direction) {
        let projection = [this.me.x + direction[0], this.me.y + direction[1]];
        if (this.is_passable(projection)) { return projection; }

        let steps = [];
        for (let i = 4; i > 0; i--) {
            steps.push([Math.floor(direction[0] / i),
                        Math.floor(direction[1] / 4)]);
            direction[0] -= steps[4 - i][0];
            direction[1] -= steps[4 - i][1];
        }

        let target = [this.me.x, this.me.y];

        for (let i = 0; i < 4; i++) {
            let head = [target[0] + steps[i][0], target[1] + steps[i][1]];
            if (!this.is_passable(head)) { break; }

            target = head;
        }

        return target;
    }

    get_concave_squares_on(target, squares) {
        let concave = [];
        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if (this.is_unit_on_square_able_to_attack(
                    this.me.unit, square, target)) {
                concave.push(square); }
        }

        return this.get_closest_square(concave);
    }

    get_crusader_target_for(target, enemies) {
        if (target == null) { return null; }

        if (!this.is_square_visible(target)) { return target; }

        // TODO: attempt to position itself directly between enemy units in a
        // line if preachers exist (or next to the castle)

        let movable = this.get_reachable_squares_for_crusaders();
        let forward = this.filter_by_distance_to_target_less_than(
            target, movable, this.distance_to(target));

        if (forward.length === 0) {
            if (this.is_safe(enemies)) { return null; }

            let adjacent = this.get_adjacent_passable_empty_squares();
            if (adjacent.length === 0) { return null; }

            let damage = this.total_damage_on_squares_from(adjacent, enemies);
            return adjacent[this.index_of_minimum_element_in(damage)];
        }

        if (this.is_robot_on_square(target)) {
            let concave = this.get_concave_squares_on(target, forward);
            if (concave !== null) { return concave; }
        }

        if (!this.is_passable(target)) {
            let path = this.reverse_raw_onion_search(
                target, [this.me.x, this.me.y],
                this.get_three_raw_onion_rings_around.bind(this));
            return path[path.length - 2];
        }

        let closest = this.get_closest_squares_to(target, forward);
        let damage = this.total_damage_on_squares_from(closest, enemies);

        return closest[this.index_of_minimum_element_in(damage)];
    }

    get_next_lattice_point() {
        let aligned = [this.me.x - this.fountain[0],
                       this.me.y - this.fountain[1]];
        let compass = this.get_aligned_compass_direction_from(aligned);

        let directions = [];
        if (compass[0] === 0) {
            directions.push([1, compass[1]]);
            directions.push([-1, compass[1]]);
        } else if (compass[1] === 0) {
            directions.push([compass[0], 1]);
            directions.push([compass[0], -1]);
        } else {
            directions.push([-compass[0], compass[1]]);
            directions.push(compass);
            directions.push([compass[0], -compass[1]]);
        }

        let point = this.get_adjacent_lattice_point();
        return this.breadth_first_search(point, directions, compass);
    }

    get_preacher_target_for(target, enemies) {
        if (target == null) { return null; }

        if (!this.is_square_visible(target)) { return target; }

        let movable = this.get_reachable_squares_for_preachers();
        let forward = this.filter_by_distance_to_target_less_than(
            target, movable, this.distance_to(target));

        if (forward.length === 0) {
            if (this.is_safe(enemies)) { return null; }

            let adjacent = this.get_adjacent_passable_empty_squares();
            if (adjacent.length === 0) { return null; }

            let damage = this.total_damage_on_squares_from(adjacent, enemies);
            return adjacent[this.index_of_minimum_element_in(damage)];
        }

        if (!this.is_passable(target)) {
            let path = this.reverse_raw_onion_search(
                target, [this.me.x, this.me.y],
                this.get_two_raw_onion_rings_around.bind(this));
            return path[path.length - 2];
        }

        let closest = this.get_closest_squares_to(target, forward);
        let damage = this.total_damage_on_squares_from(closest, enemies);

        return closest[this.index_of_minimum_element_in(damage)];
    }

    get_path_to(target, layering) {
        if (target == null) { return null; }

        return this.onion_search([this.me.x, this.me.y], target,
            layering.bind(this));
    }

    /*
     * signals
     */

    encode_coordinates(square, token, mode) {
        if (square == null) { return 0; }

        return (square[0] | square[1] << 6) + (token << 12) + (mode << 14);
    }

    decode_coordinates(signal) {
        return [[signal & 0x003f, (signal & 0x0fc0) >> 6],
                (signal & 0x3000) >> 12,
                signal >> 14];
    }

    add_message(id, message) {
        if (!this.messages[id]) { this.messages[id] = []; }

        this.messages[id].push(message);
    }

    add_or_replace_coordinates(coordinates) {
        for (let i = 0; i < this.deposit_points.length; i++) {
            if (this.distance(coordinates, this.deposit_points[i]) < 9) {
                this.deposit_points[i] = coordinates.slice();
                this.confirmation[this.deposit_points[i]] = true;
                return;
            }
        }

        this.deposit_points.push(coordinates.slice());
    }

    // something something modifying global variables silently
    process_castle_talk(robot, message) {
        if (step < 3) {
            this.castles++;
            this.add_message(robot.id, message);
            return;
        }

        if (message >= 0xF0) {
            this.update_objectives(message - 0xF0);
        } else if (message >= 0x80) {
            this.add_message(robot.id, message - 0x80);
            if (this.messages[robot.id].length === 2) {
                this.add_or_replace_coordinates(
                    this.messages[robot.id]);
                this.messages[robot.id].length = 0;
                this.free_resources(75, 250);
            }
        } else if (message === 0x0F) {
            this.free_resources(75, 250);
        }
    }

    update_objectives(mark) {
        if (this.mark < mark) {
            this.objectives.splice(mark, 1);
        } else if (this.mark > mark) {
            this.objectives.splice(mark + 1, 1);
        } else {
            this.objectives.shift();
            this.objective = this.objectives[0];
        }
    }

    /*
     * filters
     */

    filter_by_map_symmetry(squares) {
        if (this.symmetry == null) { return []; }

        let current = [this.me.x, this.me.y];
        let side = (current[this.symmetry] > this.map.length / 2);

        let filtered = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if ((square[this.symmetry] > this.map.length / 2) === side) {
                filtered.push(square); }
        }

        return filtered;
    }

    filter_by_distance_less_than(squares, value) {
        let filtered = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if (this.distance_to(square) < value) {
                filtered.push(square); }
        }

        return filtered;
    }

    filter_by_distance_to_target_less_than(target, squares, value) {
        let filtered = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if (this.distance(square, target) < value) {
                filtered.push(square); }
        }

        return filtered;
    }

    filter_robots_by_distance_to_target_less_than(target, robots, value) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.distance([robot.x, robot.y], target) < value) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_by_nearest_distance_greater_than(squares, references, value) {
        let filtered = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if (this.get_closest_distance(square, references) > value) {
                filtered.push(square); }
        }

        return filtered;
    }

    filter_robots_by_distance_less_than(robots, value) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.distance_to_(robot) < value) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_castling_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team === this.me.team && robot.id !== this.me.id
                    && robot.castle_talk !== 0) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_radioing_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_radioing(robot) && robot.id !== this.me.id) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_allied_radioing_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_radioing(robot) && robot.id !== this.me.id
                    && robot.team === this.me.team) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_allied_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team === this.me.team) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_armed_allied_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team === this.me.team && robot.unit > 2) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_visible_enemy_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_visible(robot) && robot.team !== this.me.team) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_attackable_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_in_attack_range(robot)) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_armed_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.unit !== SPECS.CHURCH && robot.unit !== SPECS.PILGRIM) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_immobile_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.unit < 2) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_robots_attacking_square(square, robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_square_in_attack_range_of(square, robot)) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_older_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.turn > this.me.turn) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_younger_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.turn <= this.me.turn) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_younger_robots_attacking_square(square, robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_square_in_attack_range_of(square, robot)
                    && robot.turn < this.me.turn) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_safe_squares(squares, robots) {
        let filtered = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if (this.is_square_safe(square, robots)) {
                filtered.push(square); }
        }

        return filtered;
    }

    /*
     * bleep-bloop, i'm a robot
     */

    is_alive(robot) {
        return this.get_robot(robot.id) != null;
    }

    is_robot_at(robot, square) {
        return robot.x === square[0] && robot.y === square[1];
    }

    is_allied_unit_at(square) {
        if (!this.is_square_visible(square)) { return false; }

        let robot_map = this.get_visible_robot_map();
        let robot_id = robot_map[square[1]][square[0]];
        if (robot_id < 1) { return false; }

        return this.get_robot(robot_id).team === this.me.team;
    }

    is_visible_to(robots) {
        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.distance_to_(robot)
                    < vision_range[robot.unit]) {
                return true; }
        }

        return false;
    }

    is_in_attack_range(robot) {
        let range = this.distance_to_(robot);
        return ((range <= max_attack_range[this.me.unit])
            && (range >= min_attack_range[this.me.unit]));
    }

    is_in_attack_range_of(robot) {
        let range = this.distance_to_(robot);
        return ((range <= max_attack_range[robot.unit])
            && (range >= min_attack_range[robot.unit]));
    }

    is_square_in_attack_range_of(square, robot) {
        let range = this.distance(square, [robot.x, robot.y]);
        return ((range <= max_attack_range[robot.unit])
            && (range >= min_attack_range[robot.unit]));
    }

    is_unit_on_square_able_to_attack(unit, square, target) {
        let range = this.distance(square, target);
        return ((range <= max_attack_range[unit])
            && (range >= min_attack_range[unit]));
    }

    is_safe(robots) {
        for (let i = 0; i < robots.length; i++) {
            if (this.is_in_attack_range_of(robots[i])) {
                return false; } }

        return true;
    }

    is_square_safe(square, robots) {
        for (let i = 0; i < robots.length; i++) {
            if (this.is_square_in_attack_range_of(square, robots[i])) {
                return false; } }

        return true;
    }

    is_robot_on_square(square) {
        let robot_map = this.get_visible_robot_map();

        return robot_map[square[1]][square[0]] > 0;
    }

    distance_to_(robot) {
        return (this.me.x - robot.x) * (this.me.x - robot.x)
            + (this.me.y - robot.y) * (this.me.y - robot.y);
    }

    count_attacks_on(square, enemies) {
        let attacks = 0;
        for (let i = 0; i < enemies.length; i++) {
            if (this.is_square_in_attack_range_of(square, enemies[i])) {
                attacks++; } }

        return attacks;
    }

    weighted_unit_count(square, robot_map) {
        let robot_id = robot_map[square[1]][square[0]];
        if (robot_id < 1) { return 0; }

        const unit_weights = [10, 4, 1.2, 1, 1.1, 1.3];

        let robot = this.get_robot(robot_id);
        if (robot == null) { return 0; }
        let adjust = robot.team === this.me.team ? -1 : 1;
        return adjust * unit_weights[robot.unit];
    }

    get_weighted_unit_count_around(square) {
        let x = square[0];
        let y = square[1];

        let robot_map = this.get_visible_robot_map();

        let count = 0;
        for (let i = -1; i < 2; i++) {
            for (let j = -1; j < 2; j++) {
                let target = [x + j, y + i];
                count += this.weighted_unit_count(target, robot_map);
            }
        }

        return count;
    }

    get_closest_robot(robots) {
        if (robots.length === 0) { return null; }

        let index = 0;
        let minimum = 100;
        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            let distance = this.distance_to_(robot);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return robots[index];
    }

    get_closest_robot_with_distance(robots) {
        if (robots.length === 0) { return null; }

        let index = 0;
        let minimum = 100;
        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            let distance = this.distance_to_(robot);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return [robots[index], minimum];
    }

    get_distance_to_closest_robot(robots) {
        if (robots.length === 0) { return null; }

        let minimum = 100;
        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            let distance = this.distance_to_(robot);
            if (distance < minimum) { minimum = distance; }
        }

        return minimum;
    }

    get_coordinates_of_closest_robot(robots) {
        let robot = this.get_closest_robot(robots);
        if (robot == null) { return null; }

        return [robot.x, robot.y];
    }

    group_by_unit_types(robots) {
        let grouped = [[], [], [], [], [], []];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            grouped[robot.unit].push(robot);
        }

        return grouped;
    }

    get_distance_to_nearest_deposit_point(visibles) {
        let allies = this.filter_allied_robots(visibles);
        let deposit_points = this.filter_immobile_robots(allies);
        if (deposit_points.length === 0) { return 16384; }

        return this.get_distance_to_closest_robot(deposit_points);
    }

    get_reachable_squares_for_crusaders() {
        let x = this.me.x;
        let y = this.me.y;

        let reachables = [];

        for (let i = 0; i < 16; i++) {
            let target = [x + ring_three[i][0], y + ring_three[i][1]];
            if (this.is_passable_and_empty(target)) {
                reachables.push(target); }
        }

        for (let i = 0; i < 8; i++) {
            let target = [x + ring_two[i][0], y + ring_two[i][1]];
            if (this.is_passable_and_empty(target)) {
                reachables.push(target); }
        }

        for (let i = 0; i < 4; i++) {
            let target = [x + ring_one[i][0], y + ring_one[i][1]];
            if (this.is_passable_and_empty(target)) {
                reachables.push(target); }
        }

        return reachables;
    }

    get_reachable_squares_for_preachers() {
        let x = this.me.x;
        let y = this.me.y;

        let reachables = [];

        for (let i = 0; i < 8; i++) {
            let target = [x + ring_two[i][0], y + ring_two[i][1]];
            if (this.is_passable_and_empty(target)) {
                reachables.push(target); }
        }

        for (let i = 0; i < 4; i++) {
            let target = [x + ring_one[i][0], y + ring_one[i][1]];
            if (this.is_passable_and_empty(target)) {
                reachables.push(target); }
        }

        return reachables;
    }

    total_damage_from(robots) {
        let total = 0;

        for (let i = 0; i < robots.length; i++) {
            total += attack_damage[robots[i].unit]; }

        return total;
    }

    total_damage_on_squares_from(squares, robots) {
        let damage = [];

        for (let i = 0; i < squares.length; i++) {
            damage.push(this.total_damage_from(
                this.filter_robots_attacking_square(squares[i], robots))); }

        return damage;
    }

    appropriate_replacement(unit) {
        if (unit < 2) { return unit; }

        if (this.karbonite >= karbonite_costs[unit]
                && this.fuel >= fuel_costs[unit]) { return unit; }

        if (unit === SPECS.PREACHER && this.karbonite >= 25
                && this.fuel >= 50) { return SPECS.PROPHET; }

        return 1;
    }

    evaluate_castle_safety(visibles, enemies) {
        if (enemies.length === 0) { return 0; }

        let allies = this.filter_armed_allied_robots(visibles);
        let comrades = this.filter_robots_by_distance_less_than(allies, 10);
        let enemy_units = this.group_by_unit_types(enemies);

        let closest = this.get_closest_robot_with_distance(enemies);
        let target = closest[0];
        let distance = closest[1];

        let defenders = this.filter_robots_by_distance_to_target_less_than(
            [target.x, target.y], allies, distance);
        let defender_units = this.group_by_unit_types(defenders);

        if (distance < 50) {
            if (enemy_units[SPECS.PROPHET].length === enemies.length
                    && enemies.length < 3 && comrades.length > 2) {
                return SPECS.CRUSADER; }

            if (defender_units[SPECS.CRUSADER].length
                    + defender_units[SPECS.PREACHER].length
                    > enemies.length + 1) {
                return SPECS.PROPHET; }

            return SPECS.PREACHER;
        } else {
            if (enemy_units[SPECS.CRUSADER].length
                    + enemy_units[SPECS.PREACHER].length
                    > defender_units[SPECS.PREACHER].length) {
                return SPECS.PREACHER; }

            if (enemies.length > defenders.length) {
                return SPECS.PROPHET; }
        }

        // not necessary to build new units, try attacking
        return 1;
    }

    evaluate_church_safety(visibles, enemies) {
        if (enemies.length === 0) { return 0; }

        let allies = this.filter_armed_allied_robots(visibles);
        let comrades = this.filter_robots_by_distance_less_than(allies, 10);
        let enemy_units = this.group_by_unit_types(enemies);

        let closest = this.get_closest_robot_with_distance(enemies);
        let target = closest[0];
        let distance = closest[1];

        let defenders = this.filter_robots_by_distance_to_target_less_than(
            [target.x, target.y], allies, distance);
        let defender_units = this.group_by_unit_types(defenders);

        if (distance < 50) {
            if (enemy_units[SPECS.PROPHET].length === enemies.length
                    && enemies.length < 3 && comrades.length > 2) {
                return SPECS.CRUSADER; }

            if (defender_units[SPECS.CRUSADER].length
                    + defender_units[SPECS.PREACHER].length
                    > enemies.length + 1) {
                return SPECS.PROPHET; }

            return SPECS.PREACHER;
        } else {
            if (enemy_units[SPECS.CRUSADER].length
                    + enemy_units[SPECS.PREACHER].length
                    > defender_units[SPECS.PREACHER].length) {
                return SPECS.PREACHER; }

            if (enemy_units[SPECS.PROPHET].length
                    > defender_units[SPECS.PROPHET].length) {
                return SPECS.PREACHER; }

            if (enemy_units[SPECS.CASTLE].length
                    + enemy_units[SPECS.CHURCH].length
                    + enemy_units[SPECS.PILGRIM].length
                    === enemies.length) {
                if (enemy_units[SPECS.CHURCH].length > 0) {
                    return SPECS.PROPHET; }

                if (defender_units[SPECS.PROPHET].length === 0) {
                    return SPECS.PROPHET; }
            }
        }

        return 0;
    }

    get_attack_target_from(attackables, priority) {
        if (attackables.length === 0) { return null; }

        let attackable_units = this.group_by_unit_types(attackables);
        for (let i = 0; i < priority.length; i++) {
            let order = priority[i];
            if (attackable_units[order].length > 0) {
                return this.get_closest_robot(attackable_units[order]); }
        }
    }

    get_splash_attack() {
        const attack_range = [
            [4, 0], [3, 1], [3, 2], [2, 3], [1, 3],
            [0, 4], [-1, 3], [-2, 3], [-3, 2], [-3, 1],
            [-4, 0], [-3, -1], [-3, -2], [-2, -3], [-1, -3],
            [0, -4], [1, -3], [2, -3], [3, -2], [3, -1],
            [3, 0], [2, 1], [2, 2], [1, 2],
            [0, 3], [-1, 2], [-2, 2], [-2, 1],
            [-3, 0], [-2, -1], [-2, -2], [-1, -2],
            [0, -3], [1, -2], [2, -2], [2, -1],
            [2, 0], [1, 1], [0, 2], [-1, 1],
            [-2, 0], [-1, -1], [0, -2], [1, -1],
            [1, 0], [0, 1], [-1, 0], [0, -1]];

        let best = null;
        let max_count = -16384;
        for (let i = 0; i < attack_range.length; i++) {
            let square = [this.me.x + attack_range[i][0],
                          this.me.y + attack_range[i][1]];
            let count = this.get_weighted_unit_count_around(square);
            if (count > max_count) {
                max_count = count;
                best = square;
            }
        }

        if (max_count <= 0) { return null; }

        return best;
    }

    /*
     * map analysis
     */

    resource_proximity_score(square) {
        let karbonite = this.get_resources(this.karbonite_map);
        let fuel = this.get_resources(this.fuel_map);

        let score = 0;

        for (let i = 0; i < karbonite.length; i++) {
            let resource = karbonite[i];
            if (this.is_same_square(square, resource)) {
                continue; }

            if (this.distance(square, resource) < 100) { score += 40; }
        }

        for (let i = 0; i < fuel.length; i++) {
            let resource = fuel[i];
            if (this.is_same_square(square, resource)) {
                continue; }

            if (this.distance(square, resource) < 100) { score += 30; }
        }

        return score;
    }

    positional_bonus(square) {
        let centre = [Math.floor(this.size / 2), Math.floor(this.size / 2)];

        return this.distance(square, centre);
    }

    evaluate_priority_of(squares, comrades, enemies) {
        let priority = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            priority.push(
                Math.min(324, this.get_closest_distance(square, enemies))
                - Math.min(400, this.get_closest_distance(square, comrades))
                + this.count_adjacent_impassable_squares_around(square)
                + this.resource_proximity_score(square));
        }

        return priority;
    }

    get_church_candidate(resources, allied_bases, enemy_bases) {
        let priority = this.evaluate_priority_of(
            resources, allied_bases, enemy_bases);

        let indices = this.indices_of_maximum_elements_in(priority);
        if (indices.length > 0) {
            if (indices.length > 1) {
                let prioritised = [];
                let distances = [];
                for (let i = 0; i < indices.length; i++) {
                    let index = indices[i];
                    prioritised.push(resources[index]);
                    distances.push(this.get_closest_distance(
                        resources[index], allied_bases));
                }

                return prioritised[this.index_of_minimum_element_in(distances)];
            } else {
                return resources[indices[0]];
            }
        }

        return null;
    }

    consider_church_expansion() {
        if (step < 3 || !this.is_available(75, 250)) { return; }

        let candidate = this.get_church_candidate(
            this.filter_by_nearest_distance_greater_than(
                this.get_resources(this.karbonite_map),
                this.deposit_points.concat(this.objectives),
                25),
            this.deposit_points, this.objectives);

        if (candidate == null) { return; }

        let index = this.index_of_closest_square_to(
            candidate, this.deposit_points);
        if (index === 0) {
            this.enqueue_unit(SPECS.PILGRIM, candidate, candidate, 1);
            this.patience = 15;
        } else if (index > this.castles) {
            let delegate = this.deposit_points[index];
            // check if church is even alive
            if (this.confirmation[delegate] === true) {
                // send signal to church
                let near_castle = this.get_closest_square_to(
                    delegate, this.castle_points);
                if (this.is_at(near_castle)) {
                    this.patience = 15;
                    this.signal(this.encode_coordinates(
                            candidate, this.mark, 1),
                        this.distance_to(delegate));
                }
            } else {
                let index = this.index_of_closest_square_to(
                    candidate, this.castle_points);
                if (index === 0) {
                    this.enqueue_unit(SPECS.PILGRIM,
                        candidate, candidate, 1);
                    this.patience = 15;
                }
            }
        }

        // push first to prevent multiple pilgrims being sent here to build a
        // new church (updated later through castle talk)
        this.deposit_points.push(candidate);
        this.reserve_resources(75, 250);
    }

    /*
     * array helpers
     */

    index_of_minimum_element_in(values) {
        if (values.length === 0) { return null; }

        let minimum = 16384;
        let index = 0;
        for (let i = 0; i < values.length; i++) {
            let value = values[i];
            if (value < minimum) {
                minimum = value;
                index = i;
            }
        }

        return index;
    }

    index_of_maximum_element_in(values) {
        if (values.length === 0) { return null; }

        let maximum = -16384;
        let index = 0;
        for (let i = 0; i < values.length; i++) {
            let value = values[i];
            if (value > maximum) {
                maximum = value;
                index = i;
            }
        }

        return index;
    }

    indices_of_maximum_elements_in(values) {
        let indices = [];

        let maximum = -16384;
        for (let i = 0; i < values.length; i++) {
            let value = values[i];
            if (value >= maximum) {
                maximum = value;
                indices.push(i);
            }
        }

        return indices;
    }
}

function compare(a, b) {
    return a.f > b.f ? 1 : a.f < b.f ? -1 : 0;
}

function heapify(heap, i) {
    let l = 2 * i + 1;
    let r = 2 * i + 2;
    let smallest = i;
    if (l < heap.list.length && compare(heap.list[l], heap.list[i]) < 0) {
        smallest = l; }
    if (r < heap.list.length
            && compare(heap.list[r], heap.list[smallest]) < 0) {
        smallest = r; }
    if (smallest !== i) {
        swap(heap.list, i, smallest);
        heapify(heap, smallest);
    }
}

function swap(array, a, b) {
    let temp = array[a];
    array[a] = array[b];
    array[b] = temp;
}

function parent_of(i) {
    if (i === 0) { return null; }

    return Math.floor((i - 1) / 2);
}
