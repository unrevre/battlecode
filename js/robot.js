import { BCAbstractRobot, SPECS } from 'battlecode';

import binary_heap from './binary_heap.js';

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

        this.castle_points = [];
        this.deposit_points = [];
        this.objectives = [];

        this.objective = null;

        this.local_resources = [];

        this.unit_queue = [];
        this.signal_queue = [];

        this.messages = [];

        this.reserved = [0, 0];

        this.fountain = null;
        this.memory = null;
        this.victim = null;

        this.target = null;
        this.path = null;

        this.mode = 0;
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
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.karbonite_map), 26)),
                    occupied: [] });
                this.local_resources.push({
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.fuel_map), 26)),
                    occupied: [] });

                this.objective = this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]);
                this.objectives.push(this.objective);

                this.castle_points.push([this.me.x, this.me.y]);
                this.deposit_points.push([this.me.x, this.me.y]);
            }

            let visibles = this.get_visible_robots();

            // clear castle talk by default
            let castle_talk_value = 0x00;

            // check castle talk - abuse all information available
            let castling = this.filter_castling_robots(visibles);
            for (let i = 0; i < castling.length; i++) {
                let robot = castling[i];
                if (robot.id !== this.me.id) {
                    let message = robot.castle_talk;
                    this.process_castle_talk(robot, message);
                }
            }

            switch (step) {
                case 0:
                    this.mark = this.messages.length;
                    break;
                case 2:
                    this.castles /= 2;
                    for (let i = 0; i < this.castles; i++) {
                        let coords = [this.messages[i],
                                      this.messages[i + this.castles]];
                        this.castle_points.push(coords.slice());
                        this.deposit_points.push(coords.slice());
                        this.objectives.push(
                            this.reflect_about_symmetry_axis(coords));
                    }
                    this.messages.length = 0;
                    break;
            }

            // broadcast coordinates at the beginning of the game
            switch (step) {
                case 0:
                    castle_talk_value = this.me.x;
                    break;
                case 1:
                    castle_talk_value = this.me.y;
                    break;
            }

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
                let token = message[1];
                let coordinates = message[0];
                if (token === 0xd && this.objectives.length > 1
                        && coordinates[0] === this.objective[0]
                        && coordinates[1] === this.objective[1]) {
                    castle_talk_value = this.mark + 0xF0;
                    this.update_objectives(this.mark);
                }
            }

            // send castle talk
            this.castle_talk(castle_talk_value);

            let allies = this.filter_attacking_allied_robots(visibles);
            let enemies = this.filter_visible_enemy_robots(visibles);
            let attackables = this.filter_attackable_robots(enemies);

            // TODO: improve this, really
            let castle_safety = this.evaluate_castle_safety(visibles, enemies);

            switch (castle_safety) {
                case 0:
                    this.consider_church_expansion();
                    break;
                case 1:
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PROPHET, null,
                        this.get_coordinates_of_closest_robot(enemies));
                    break;
                case 2:
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PREACHER,
                        this.get_coordinates_of_closest_robot(enemies),
                        this.get_coordinates_of_closest_robot(enemies));
                    break;
                case 3: {
                    let prey = this.get_attack_target_from(
                        attackables, [4, 5, 2, 3, 1, 0]);
                    if (prey != null) {
                        this.log('  - attack unit [' + prey.id + '], type ('
                            + prey.unit + ') at ' + prey.x + ', ' + prey.y);
                        return this.attack(prey.x - this.me.x, prey.y - this.me.y);
                    }
                    break;
                }
            }

            // queue pilgrims on all available local resources after clearing
            // initial build queue
            // TODO: check and replenish pilgrims occasionally if time allows
            for (let i = 0; i < 2; i++) {
                if (this.unit_queue.length === 0) {
                    let square = this.next_available_resource_from(
                        this.local_resources[i]);
                    if (square != null && this.enqueue_unit(
                            SPECS.PILGRIM, square, square)) {
                        this.local_resources[i].occupied[square] = true; }
                }
            }

            if (this.unit_queue.length > 0) {
                let unit = this.unit_queue.shift();

                let spawn = this.get_buildable_square_for(
                    unit.unit, unit.target, allies);
                if (spawn != null) {
                    if (unit.signal != null) {
                        this.signal(this.encode_coordinates(
                            unit.signal, this.mark), 2); }

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

            // clear castle talk by default
            let castle_talk_value = 0x00;

            let visibles = this.get_visible_robots();

            if (step === 0) {
                // TODO: contingency for when no resources are found
                this.local_resources.push({
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.karbonite_map), 26)),
                    occupied: [] });
                this.local_resources.push({
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.fuel_map), 26)),
                    occupied: [] });

                this.objective = this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]);
            }

            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                let message = this.decode_coordinates(robot.signal);
                if (step === 0 && robot.unit === SPECS.PILGRIM
                        && robot.team === this.me.team) {
                    this.target = message[0];
                    this.mark = message[1];
                    this.memory = this.target;
                    this.local_resources[0].occupied[message[0]] = true;
                    break;
                } else if (message[1] === 0xc) {
                    let candidate = message[0];
                    if (this.is_resource(candidate, this.karbonite_map)) {
                        this.enqueue_unit(SPECS.PILGRIM,
                            candidate, candidate); }
                }
            }

            switch (step) {
                case 0:
                    castle_talk_value = this.me.x + 0x80;
                    break;
                case 1:
                    castle_talk_value = this.me.y + 0x80;
                    break;
            }

            this.castle_talk(castle_talk_value);

            let allies = this.filter_attacking_allied_robots(visibles);
            let enemies = this.filter_visible_enemy_robots(visibles);

            // TODO: improve this, really
            let church_safety = this.evaluate_church_safety(visibles, enemies);

            switch (church_safety) {
                case 0:
                    break;
                case 1:
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PROPHET, null,
                        this.get_coordinates_of_closest_robot(enemies));
                    break;
                case 2:
                    this.unit_queue.length = 0;
                    this.enqueue_unit(SPECS.PREACHER,
                        this.get_coordinates_of_closest_robot(enemies),
                        this.get_coordinates_of_closest_robot(enemies));
                    break;
            }

            // TODO: decide units/target resource based on distribution of
            // resources
            for (let i = 0; i < 2; i++) {
                if (this.unit_queue.length === 0) {
                    let square = this.next_available_resource_from(
                        this.local_resources[i]);
                    if (square != null && this.enqueue_unit(
                            SPECS.PILGRIM, square, square)) {
                        this.local_resources[i].occupied[square] = true; }
                }
            }

            if (this.unit_queue.length > 0) {
                let unit = this.unit_queue.shift();

                let spawn = this.get_buildable_square_for(
                    unit.unit, unit.target, allies);
                if (spawn != null) {
                    if (unit.signal != null) {
                        this.signal(this.encode_coordinates(
                            unit.signal, this.mark), 2); }

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
                if (robot.unit < 2 && this.memory == null) {
                    let message = this.decode_coordinates(robot.signal);
                    this.target = message[0];
                    this.mark = message[1];
                    this.memory = this.target;
                    break;
                }
            }

            // on a church building mission
            // TODO: make this part of the initial build signal
            if (step === 0 && this.distance_to(this.target) > 36) {
                this.objective = this.get_optimal_square_by_adjacent_resources(
                    this.target);
                let path = this.reverse_raw_onion_search(
                    this.objective, [this.me.x, this.me.y],
                    this.get_two_raw_onion_rings_around.bind(this));
                this.target = path[path.length - 2];
            }

            // clear target destination after arrival
            if (this.target != null && this.target[0] === this.me.x
                    && this.target[1] === this.me.y) {
                this.target = null;

                // TODO: more reliable conditions to determine if on church
                // building mission, likely together with initial signal
                if (this.objective != null
                        && this.get_adjacent_deposit_point() == null
                        && this.distance_to(this.fountain) > 36) {
                    let church =
                        this.get_buildable_square_by_adjacent_resources();
                    if (church != null) {
                        this.signal(this.encode_coordinates(
                            this.memory, this.mark), 2);
                        this.fountain = church;
                        this.target = this.memory;
                        this.log('  - build unit type [1] at (' + church[0]
                            + ', ' + church[1] + ')');
                        return this.build_unit(SPECS.CHURCH,
                                               church[0] - this.me.x,
                                               church[1] - this.me.y);
                    }
                }
            }

            let enemies = this.filter_attack_capable_robots(
                this.filter_visible_enemy_robots(visibles));

            let attacked_count = 0;
            for (let i = 0; i < enemies.length; i++) {
                if (this.is_in_attack_range_of(enemies[i])) {
                    attacked_count++; } }

            if (attacked_count > 0) {
                this.mode = 1;
            } else if (enemies.length > 0) {
                let enemies_by_units = this.group_by_unit_types(enemies);
                if (enemies_by_units[SPECS.CRUSADER].length > 0) {
                    let crusader = this.get_closest_robot(
                        enemies_by_units[SPECS.CRUSADER]);
                    if (this.distance_to([crusader.x, crusader.y]) <= 20) {
                        this.mode = 1;
                    } else if (this.me.karbonite > 9 || this.me.fuel > 49) {
                        // trigger deposit if enemies are closing in
                        this.mode = 2;
                    }
                } else if (this.me.karbonite > 9 || this.me.fuel > 49) {
                    // trigger deposit if enemies are closing in
                    this.mode = 2;
                }
            } else if (this.mode > 0) {
                this.target = null;
                this.mode = 0;
            }

            if (this.mode === 1) {
                this.target = this.evade_threat_from(
                    this.get_threat_direction_from(enemies));
            } else if (this.mode === 2) {
                if (this.is_adjacent_deposit_point(this.fountain)) {
                    this.log('  - depositing resources [emergency]');
                    return this.give(this.fountain[0] - this.me.x,
                                     this.fountain[1] - this.me.y,
                                     this.me.karbonite, this.me.fuel);
                }
            }

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
                if (this.is_safe(destination, enemies)) {
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
                if (robot.unit < 2 && robot.x === this.fountain[0]
                        && robot.y === this.fountain[1]) {
                    if (this.target == null) {
                        this.target = this.decode_coordinates(robot.signal)[0];
                        this.memory = this.target;
                        this.objective = this.target;
                        break;
                    }
                }
            }

            // TODO: overhaul attack targeting system
            let enemies = this.filter_visible_enemy_robots(visibles);

            // identify castle if it is within range
            if (this.memory != null
                    && this.distance_to(this.memory) < 50) {
                let castle_prescence = null;
                for (let i = 0; i < enemies.length; i++) {
                    if (enemies[i].unit === 0) {
                        castle_prescence = enemies[i];
                        break;
                    }
                }

                if (castle_prescence == null) {
                    let message = this.encode_coordinates(this.memory, 0xd);
                    this.signal(message, this.distance_to(this.fountain));

                    this.victim = null;
                    this.objective = null;
                    this.memory = null;

                    this.target = null;
                }
            }

            // start with victim (target to focus) - this usually is either the
            // last enemy attacked, or the castle
            // TODO: use victim to remember attacked units - preferentially
            // attacked since they have lower health
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
                this.log('  - attack unit [' + prey.id + '], type ('
                    + prey.unit + ') at ' + prey.x + ', ' + prey.y);
                return this.attack(prey.x - this.me.x, prey.y - this.me.y);
            }

            // TODO: fuzzy target destinations to surround enemies properly
            // TODO: wrap around defenders (if possible) to attack castle
            // TODO: consider using pilgrims for vision

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_to(this.target);

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
                if (robot.unit < 2 && robot.x === this.fountain[0]
                        && robot.y === this.fountain[1]) {
                    if (this.memory == null) {
                        this.memory = this.decode_coordinates(robot.signal)[0];
                        break;
                    }
                }
            }

            // TODO: prophets generally should seek out choke points or cover
            // behind friend units and remain stationary

            let enemies = this.filter_visible_enemy_robots(visibles);
            let attackables = this.filter_attackable_robots(enemies);

            let prey = this.get_attack_target_from(attackables,
                                                   [4, 5, 2, 0, 3, 1]);
            if (prey != null) {
                this.log('  - attack unit [' + prey.id + '], type ('
                    + prey.unit + ') at ' + prey.x + ', ' + prey.y);
                return this.attack(prey.x - this.me.x, prey.y - this.me.y);
            }

            this.target = null;

            // TODO: also move off resource squares
            // TODO: form lattice structure
            if (this.is_adjacent(this.fountain)) {
                // move off buildable squares
                this.target = this.get_closest_square_by_distance(
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

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_to(this.target);

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
                if (robot.unit < 2 && robot.x === this.fountain[0]
                        && robot.y === this.fountain[1]) {
                    if (this.memory == null) {
                        this.memory = this.decode_coordinates(robot.signal)[0];
                        break;
                    }
                }
            }

            let enemies = this.filter_visible_enemy_robots(visibles);
            let attackables = this.filter_attackable_robots(enemies);

            let victim = this.get_attack_target_from(
                attackables, [4, 5, 2, 0, 3, 1]);
            if (victim != null) {
                // TODO: be sure not to splash on own castle (is this
                // possible?)
                let point = this.get_splash_attack_at([victim.x, victim.y]);
                this.log('  - attack unit [' + victim.id + '], type ('
                    + victim.unit + ') at ' + point[0] + ', ' + point[1]);
                return this.attack(point[0] - this.me.x, point[1] - this.me.y);
            }

            this.target = null;

            // TODO: also move off resource squares
            if (this.is_adjacent(this.fountain)) {
                // move off buildable squares
                this.target = this.get_closest_square_by_distance(
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

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_to(this.target);

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

    get_buildable_squares_at(square) {
        return this.get_adjacent_passable_empty_squares_at(square);
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

    get_closest_distance(square, targets) {
        if (targets.length === 0) { return null; }

        let minimum = 16384;
        for (let i = 0; i < targets.length; i++) {
            let distance = this.distance(square, targets[i]);
            if (distance < minimum) {
                minimum = distance; }
        }

        return minimum;
    }

    get_closest_square_by_distance(squares) {
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

    get_closest_square_by_distance_from(target, squares) {
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

    index_of_closest_target_by_distance_from(square, targets) {
        let index = 0;
        let minimum = 16384;
        for (let i = 0; i < targets.length; i++) {
            let distance = this.distance(square, targets[i]);
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

    is_resource(square, resource_map) {
        return resource_map[square[1]][square[0]];
    }

    get_resources(resource_map) {
        let resources = [];

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                if (resource_map[i][j]) {
                    resources.push([j, i]); } } }

        return resources;
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
    }

    /*
     * unit queue
     */

    enqueue_unit(unit, signal, target) {
        const karbonite_costs = [0, 50, 10, 15, 25, 30];
        const fuel_costs = [0, 200, 50, 50, 50, 50];

        // FIXME: signals fuel cost not taken into account
        if (this.is_available(karbonite_costs[unit], fuel_costs[unit])) {
            this.unit_queue.push({
                unit: unit,
                signal: signal,
                target: target
            });

            return true;
        }

        return false;
    }

    /*
     * pathing
     */

    get_two_onion_rings_around(square) {
        const ring_two = [
            [0, -2], [1, -1], [2, 0], [1, 1],
            [0, 2], [-1, 1], [-2, 0], [-1, -1]];
        const ring_one = [
            [0, -1], [1, 0], [0, 1], [-1, 0]];

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
        const ring_two = [
            [0, -2], [1, -1], [2, 0], [1, 1],
            [0, 2], [-1, 1], [-2, 0], [-1, -1]];
        const ring_one = [
            [0, -1], [1, 0], [0, 1], [-1, 0]];

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

        let node_heap = new binary_heap();
        node_map[start[1]][start[0]].f = this.metric(start, end);
        node_heap.insert(node_map[start[1]][start[0]]);

        while (!node_heap.empty()) {
            let node = node_heap.pop();
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
                node_heap.insert(object);
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

        let node_heap = new binary_heap();

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
            node_heap.insert(cell);
        }

        while (!node_heap.empty()) {
            node = node_heap.pop();
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
                node_heap.insert(object);
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

        let node_heap = new binary_heap();

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
            node_heap.insert(cell);
        }

        while (!node_heap.empty()) {
            node = node_heap.pop();
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
                node_heap.insert(object);
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

    get_buildable_square_for(unit, target, allies) {
        if (unit === SPECS.PILGRIM) {
            return this.get_buildable_square_closest_to(target);
        } else {
            if (target == null) {
                return this.get_buildable_square_supporting(allies);
            } else {
                return this.get_buildable_square_for_attacking(unit, target);
            }
        }
    }

    get_buildable_square_closest_to(target) {
        let adjacent = this.get_buildable_squares();
        if (adjacent.length === 0) { return null; }

        if (!this.is_passable(target)) {
            return this.get_closest_square_by_distance_from(target, adjacent); }

        if (this.me.x === target[0] && this.me.y === target[1]) {
            return this.get_buildable_square_closest_to(this.objective); }

        let steps = [];
        for (let i = 0; i < adjacent.length; i++) {
            let square = adjacent[i];
            if (square[0] === target[0] && square[1] === target[1]) {
                return target; }

            steps.push(this.reverse_fresh_onion_search(square, target,
                this.get_two_raw_onion_rings_around.bind(this)).length);
        }

        return adjacent[this.index_of_minimum_element_in(steps)];
    }

    get_buildable_square_supporting(allies) {
        let direction = this.get_aligned_compass_direction_from(
            this.get_vector_sum_of_metric_weighted_directions(allies));

        return this.get_buildable_square_closest_to(
            this.step_towards(direction));
    }

    get_buildable_square_for_attacking(unit, target, enemies) {
        let adjacent = this.get_buildable_squares();
        if (adjacent.length === 0) { return null; }

        if (this.is_visible(target)) {
            let candidates = [];
            for (let i = 0; i < adjacent.length; i++) {
                let square = adjacent[i];
                if (this.is_unit_on_square_able_to_attack(unit, square, target)) {
                    candidates.push(square);
                }
            }

            if (candidates.length === 0) {
                return this.get_buildable_square_closest_to(target); }

            let predamage = [];
            for (let i = 0; i < candidates.length; i++) {
                predamage.push(this.total_damage_for(
                    this.filter_younger_robots_attacking_square(
                        candidates[i], enemies))); }

            return candidates[this.index_of_minimum_element_in(predamage)];
        }

        return this.get_buildable_square_closest_to(target);
    }

    get_optimal_square_by_adjacent_resources(square) {
        let maximum = -128;
        let optimal = square;

        let x = square[0];
        let y = square[1];

        for (let i = -2; i < 3; i++) {
            for (let j = -2; j < 3; j++) {
                let head = [x + i, y + j];
                if (this.is_passable(head)) {
                    let score = this.score_resource_squares_around(head) * 10
                        - this.count_adjacent_impassable_squares_around(head)
                        - 0.01 * Math.abs(((this.size - 1) / 2)
                            - head[this.symmetry]);
                    if (this.is_resource(head, this.karbonite_map)
                            || this.is_resource(head, this.fuel_map)) {
                        score -= 30; }

                    if (score > maximum) {
                        maximum = score;
                        optimal = head;
                    }
                }
            }
        }

        return optimal;
    }

    get_buildable_square_by_adjacent_resources() {
        let adjacent = this.get_buildable_squares();
        if (adjacent.length === 0) { return null; }

        let counts = [];

        for (let i = 0; i < adjacent.length; i++) {
            counts.push(this.score_resource_squares_around(adjacent[i]) * 10
                - this.count_adjacent_impassable_squares_around(adjacent[i])); }

        return adjacent[this.index_of_maximum_element_in(counts)];
    }

    get_pilgrimage_path_to(target) {
        if (target == null) { return null; }

        if (target[0] === this.fountain[0] && target[1] === this.fountain[1]) {
            return this.reverse_raw_onion_search(
                this.fountain, [this.me.x, this.me.y],
                this.get_two_raw_onion_rings_around.bind(this));
        }

        let final_target = this.adjust_target_for_obstructions(target);
        if (final_target != null) {
            return this.onion_search([this.me.x, this.me.y], final_target,
                this.get_two_onion_rings_around.bind(this)); }

        return null;
    }

    adjust_target_for_obstructions(target) {
        // assume target is never null
        if (!this.is_passable_and_empty(target)) {
            if (this.is_adjacent(target)) { return null; }

            let adjacent = this.get_adjacent_passable_empty_squares_at(target);
            let closest = this.get_closest_square_by_distance(adjacent);
            if (closest != null) { return closest; }

            return this.get_closest_square_by_distance(
                this.get_next_to_adjacent_passable_empty_squares_at(target));
        }

        return target;
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

    get_aligned_compass_direction_from(vector) {
        let x = vector[0];
        let y = vector[1];

        let max = Math.max(Math.abs(x), Math.abs(y));

        return [Math.round(x / max), Math.round(y / max)];
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

        if (threat_x * threat_y !== 0) {
            let max = Math.max(Math.abs(threat_x), Math.abs(threat_y));
            threat_x = Math.round(threat_x * 4 / max);
            threat_y = Math.round(threat_y * 4 / max);
        } else {
            threat_x = 4 * Math.sign(threat_x);
            threat_y = 4 * Math.sign(threat_y);
        }

        return [threat_x, threat_y];
    }

    step_towards(direction) {
        let steps = [[this.me.x, this.me.y]];

        for (let i = 0; i < 4; i++) {
            steps.push([steps[i][0] + direction[0],
                        steps[i][1] + direction[1]]); }

        for (let i = 4; i > 0; i--) {
            if (this.is_passable(steps[i])) {
                return steps[i]; } }

        this.log('ERROR: unreachable (step_towards)');
        return null;
    }

    four_step_decompose(vector) {
        let steps = [];

        for (let i = 4; i > 0; i--) {
            steps.push([Math.floor(vector[0] / i), Math.floor(vector[1] / 4)]);
            vector[0] -= steps[4 - i][0];
            vector[1] -= steps[4 - i][1];
        }

        return steps;
    }

    evade_threat_from(threat) {
        let projection = [this.me.x + threat[0], this.me.y + threat[1]];
        if (this.is_passable(projection)) { return projection; }

        let target = [this.me.x, this.me.y];

        let steps = this.four_step_decompose(threat);
        for (let i = 0; i < steps.length; i++) {
            let head = [target[0] + steps[i][0], target[1] + steps[i][1]];
            if (!this.is_passable(head)) { break; }

            target = head;
        }

        return target;
    }

    get_final_target_for(target) {
        if (target != null && !this.is_passable_and_empty(target)) {
            target = this.smear_centred(target); }

        return target;
    }

    smear_centred(square) {
        let squares = this.get_adjacent_passable_empty_squares_at(square);
        if (squares.length === 0) {
            squares = this.get_next_to_adjacent_passable_empty_squares_at(
                square); }

        if (squares.length > 0) {
            return squares[Math.floor(Math.random() * squares.length)]; }

        return null;
    }

    get_path_to(target) {
        if (target == null) { return null; }

        if (this.me.unit === SPECS.CRUSADER) {
            return this.onion_search([this.me.x, this.me.y], target,
                this.get_three_onion_rings_around.bind(this)); }

        return this.onion_search([this.me.x, this.me.y], target,
            this.get_two_onion_rings_around.bind(this));
    }

    /*
     * signals
     */

    encode_coordinates(square, token) {
        if (square == null) { return 0; }

        return (square[0] | square[1] << 6) + (token << 12);
    }

    decode_coordinates(signal) {
        return [[signal & 0x003f, (signal & 0x0fc0) >> 6], signal >> 12];
    }

    add_message(id, message) {
        if (!this.messages[id]) { this.messages[id] = []; }

        this.messages[id].push(message);
    }

    add_or_replace_coordinates(coordinates) {
        for (let i = 0; i < this.deposit_points.length; i++) {
            if (this.distance(coordinates, this.deposit_points[i]) < 9) {
                this.deposit_points[i] = coordinates.slice();
                return;
            }
        }

        this.deposit_points.push(coordinates.slice());
    }

    // something something modifying global variables silently
    process_castle_talk(robot, message) {
        if (step < 3) {
            this.castles++;
            this.messages.push(message);
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
            if (this.distance_to([robot.x, robot.y]) < value) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_castling_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team === this.me.team && robot.castle_talk !== 0) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_radioing_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_radioing(robot)) {
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

    filter_attacking_allied_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team === this.me.team && robot.unit > 2) {
                filtered.push(robot); }
        }

        return filtered;
    }

    filter_allied_pilgrim_coordinates(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team === this.me.team && robot.unit === SPECS.PILGRIM) {
                filtered.push([robot.x, robot.y]); }
        }

        return filtered;
    }

    filter_enemy_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team !== this.me.team) {
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

    filter_attack_capable_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.unit !== SPECS.CHURCH && robot.unit !== SPECS.PILGRIM) {
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

    /*
     * bleep-bloop, i'm a robot
     */

    is_alive(robot) {
        return this.get_robot(robot.id) != null;
    }

    is_in_attack_range(robot) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 16];

        let range = this.distance_to([robot.x, robot.y]);
        return ((range <= max_attack_range[this.me.unit])
            && (range >= min_attack_range[this.me.unit]));
    }

    is_in_attack_range_of(robot) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 26];

        let range = this.distance_to([robot.x, robot.y]);
        return ((range <= max_attack_range[robot.unit])
            && (range >= min_attack_range[robot.unit]));
    }

    is_square_in_attack_range_of(square, robot) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 26];

        let range = this.distance(square, [robot.x, robot.y]);
        return ((range <= max_attack_range[robot.unit])
            && (range >= min_attack_range[robot.unit]));
    }

    is_unit_on_square_able_to_attack(unit, square, target) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 26];

        let range = this.distance(square, target);
        return ((range <= max_attack_range[unit])
            && (range >= min_attack_range[unit]));
    }

    is_safe(square, robots) {
        for (let i = 0; i < robots.length; i++) {
            if (this.is_square_in_attack_range_of(square, robots[i])) {
                return false; } }

        return true;
    }

    unit_count(square, robot_map) {
        let robot_id = robot_map[square[1]][square[0]];
        if (robot_id < 1) { return 0; }

        let robot = this.get_robot(robot_id);
        return robot.team === this.me.team ? -1 : 1;
    }

    get_unit_count_difference_around(square) {
        let robot_map = this.get_visible_robot_map();

        let count = this.unit_count(square, robot_map);

        let adjacent = this.get_adjacent_passable_squares_at(square);
        for (let i = 0; i < adjacent.length; i++) {
            count += this.unit_count(adjacent[i], robot_map); }

        return count;
    }

    get_closest_robot(robots) {
        if (robots.length === 0) { return null; }

        let index = 0;
        let minimum = 100;
        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            let distance = this.distance_to([robot.x, robot.y]);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return robots[index];
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

    total_damage_for(robots) {
        const attack_damage = [10, 0, 0, 10, 10, 20];

        let total = 0;

        for (let i = 0; i < robots.length; i++) {
            total += attack_damage[robots[i].unit]; }

        return total;
    }

    evaluate_castle_safety(visibles, enemies) {
        if (enemies.length === 0) { return 0; }

        let comrades = this.filter_robots_by_distance_less_than(
            this.filter_allied_robots(visibles), 10);
        let enemies_by_units = this.group_by_unit_types(enemies);
        let comrades_by_units = this.group_by_unit_types(comrades);

        if (enemies_by_units[4].length > comrades_by_units[4].length) {
            return 1;
        } else if (enemies_by_units[3].length > comrades_by_units[5].length + 1) {
            return 2;
        } else if (enemies_by_units[5].length > comrades_by_units[4].length) {
            let nearest = this.get_closest_robot(enemies_by_units[5]);
            if (this.distance_to([nearest.x, nearest.y]) <= 25) {
                return 2;
            } else {
                return 1;
            }
        }

        // not necessary to build new units, try attacking
        return 3;
    }

    evaluate_church_safety(visibles, enemies) {
        if (enemies.length === 0) { return 0; }

        let comrades = this.filter_robots_by_distance_less_than(
            this.filter_allied_robots(visibles), 10);
        let enemies_by_units = this.group_by_unit_types(enemies);
        let comrades_by_units = this.group_by_unit_types(comrades);

        if (enemies_by_units[4].length > comrades_by_units[4].length) {
            return 1;
        } else if (enemies_by_units[3].length > comrades_by_units[5].length) {
            return 2;
        } else if (enemies_by_units[5].length > comrades_by_units[4].length) {
            let nearest = this.get_closest_robot(enemies_by_units[5]);
            if (this.distance_to([nearest.x, nearest.y]) <= 25) {
                return 2;
            } else {
                return 1;
            }
        }

        // churches cannot attack, so there must always be a response
        return 1;
    }

    get_attack_target_from(attackables, priority) {
        if (attackables.length === 0) { return null; }

        let attackables_by_units = this.group_by_unit_types(attackables);
        for (let i = 0; i < priority.length; i++) {
            let order = priority[i];
            if (attackables_by_units[order].length > 0) {
                return this.get_closest_robot(attackables_by_units[order]); }
        }
    }

    get_splash_attack_at(target) {
        let square = target;

        let max_count = this.get_unit_count_difference_around(target);
        let adjacent = this.get_adjacent_passable_squares_at(target);
        for (let i = 0; i < adjacent.length; i++) {
            let count = this.get_unit_count_difference_around(adjacent[i]);
            if (count > max_count) {
                max_count = count;
                square = adjacent[i];
            }
        }

        return square;
    }

    /*
     * map analysis
     */

    evaluate_safety_for_each(squares, comrades, enemies) {
        let safety = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            safety.push(this.get_closest_distance(square, enemies)
                - this.get_closest_distance(square, comrades)
                + this.count_adjacent_impassable_squares_around(square));
        }

        return safety;
    }

    get_church_candidate(resources, allied_bases, enemy_bases) {
        let safety = this.evaluate_safety_for_each(
            resources, allied_bases, enemy_bases);

        let index = this.index_of_maximum_element_in(safety);
        if (index != null) { return resources[index]; }

        return null;
    }

    consider_church_expansion() {
        if (this.is_available(120, 300)) {
            let candidate = this.get_church_candidate(
                this.filter_by_nearest_distance_greater_than(
                    this.get_resources(this.karbonite_map),
                    this.deposit_points.concat(this.objectives),
                    25),
                this.deposit_points, this.objectives);

            if (candidate == null) { return; }

            let index = this.index_of_closest_target_by_distance_from(
                candidate, this.deposit_points);
            if (index === 0) {
                this.enqueue_unit(SPECS.PILGRIM, candidate, candidate);
            } else if (index >= this.castles) {
                // send signal to church
                let near_castle = this.get_closest_square_by_distance_from(
                    this.deposit_points[index], this.castle_points);
                if (this.me.x === near_castle[0]
                        && this.me.y === near_castle[1]) {
                    this.signal(this.encode_coordinates(candidate, 0xc),
                        this.distance_to(this.deposit_points[index])); }
            }

            // push first to prevent multiple pilgrims being sent here to build
            // a new church (updated later through castle talk)
            this.deposit_points.push(candidate);
            this.reserve_resources(75, 250);
        }
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
}
