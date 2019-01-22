import {BCAbstractRobot, SPECS} from 'battlecode';

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
        this.castle_order = null;
        this.castle_coords = [];

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

        this.current_rusher = 0;

        this.mode = 0;
    }

    turn() {
        step++;

        this.log('START TURN ' + step);

        if (step == 0) {
            this.size = this.map.length;
        }

        if (this.me.unit == SPECS.CASTLE) {
            this.log('Castle [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            if (step == 0) {
                this.symmetry = this.determine_map_symmetry();

                // TODO: contingency for when no resources are found
                this.local_resources.push({
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.karbonite_map), 26)),
                    occupied: [],
                    index: 0 });
                this.local_resources.push({
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.fuel_map), 26)),
                    occupied: [],
                    index: 0 });

                this.objective = this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]);
                this.objectives.push(this.objective);

                this.deposit_points.push([this.me.x, this.me.y]);
            }

            // clear castle talk by default
            let castle_talk_value = 0x00;

            let visibles = this.get_visible_robots();
            let enemies = this.filter_visible_enemy_robots(visibles);
            let attackables = this.filter_attackable_robots(enemies);

            let castle_safety = this.evaluate_castle_safety(
                visibles, enemies);

            switch (castle_safety) {
                case 0:
                    // TODO: group resource patches to avoid building
                    // overlapping churches
                    if (this.castle_order == 0 && step > 10
                            && this.is_available(120, 300)) {
                        let candidate = this.get_church_candidate(
                            this.filter_by_nearest_distance_greater_than(
                                this.get_resources(this.karbonite_map),
                                this.deposit_points, 25),
                            this.deposit_points, this.objectives);
                        this.log('DEBUG: CHURCH: ' + candidate);
                        if (candidate != null) {
                            this.enqueue_unit(SPECS.PILGRIM, candidate,
                                candidate);
                            // push first to prevent multiple pilgrims being
                            // sent here - updated later through castle talk
                            this.deposit_points.push(candidate);
                            this.reserve_resources(75, 250);
                        }
                    }
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

            // check castle talk - abuse all information available
            // TODO: improve this
            let castling = this.filter_castling_robots(visibles);
            for (let i = 0; i < castling.length; i++) {
                let robot = castling[i];
                if (robot.id != this.me.id) {
                    let message = robot.castle_talk;
                    if (step < 3) {
                        this.castles++;
                        this.castle_coords.push(message - 0x80);
                    }

                    else if (message >= 0xF0) {
                        this.mode = 1;
                        this.current_rusher = message - 0xF0 + 1;
                    }

                    else if (message >= 0x70) {
                        this.add_message(robot.id, message - 0x70);
                        if (this.messages[robot.id].length == 2) {
                            this.replace_coordinates(this.messages[robot.id]);
                            this.messages[robot.id].length = 0;
                            this.free_resources(75, 250);
                        }
                    }
                }
            }

            switch (step) {
                case 0:
                    this.castle_order = this.castle_coords.length;
                    break;
                case 2:
                    this.castles /= 2;
                    for (let i = 0; i < this.castles; i++) {
                        let coords = [this.castle_coords[i],
                                      this.castle_coords[i + this.castles]];
                        this.deposit_points.push(coords.slice());
                        this.objectives.push(
                            this.reflect_about_symmetry_axis(coords));
                    }
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

            // broadcast coordinates (highest 4 bits)
            switch (step) {
                case 0:
                    castle_talk_value = this.me.x + 0x80;
                    break;
                case 1:
                    castle_talk_value = this.me.y + 0x80;
                    break;
            }

            this.castle_talk(castle_talk_value);

            if (step == 0) {
                if (this.size < 40 && this.castle_order == 0) {
                    this.mode = 1;
                    this.enqueue_unit(SPECS.CRUSADER, null, this.objective);
                    this.enqueue_unit(SPECS.CRUSADER, null, this.objective);
                    this.enqueue_unit(SPECS.CRUSADER, null, this.objective);
                }

                this.enqueue_unit(SPECS.CRUSADER, this.objective,
                    this.objective);
            }

            if (step > 80) {
                this.mode = 0;
            }

            // TODO: check and replenish pilgrims occasionally if time allows
            // (in case pilgrims are killed)

            // put pilgrims on all available local resources after initial
            // build queue is cleared
            for (let i = 0; i < 2; i++) {
                if (this.unit_queue.length == 0) {
                    let square = this.next_available_resource_from(
                        this.local_resources[i]);
                    if (square != null) {
                        if (this.enqueue_unit(SPECS.PILGRIM, square, square)) {
                            this.local_resources[i].index++;
                            this.local_resources[i].occupied[square] = true;
                        }
                    }
                }
            }

            // continuously produce crusaders if rushing
            if (this.unit_queue.length == 0) {
                if (this.mode == 1
                        && this.current_rusher == this.castle_order) {
                    this.enqueue_unit(SPECS.CRUSADER, this.objective, null);
                }

                // produce prophets otherwise, to build up defences
                else if (step > 10 && this.is_available(80, 200)) {
                    this.enqueue_unit(SPECS.PROPHET, this.objective, null);
                }
            }

            if (this.unit_queue.length > 0) {
                let unit = this.unit_queue.shift();

                let spawn = this.get_buildable_square_closest_by_distance_to(
                        unit.target);

                if (spawn != null) {
                    const signal = unit.signal;
                    if (signal != null) {
                        this.signal(this.encode_coordinates(signal),
                                    this.distance([this.me.x, this.me.y],
                                                  spawn) + 1);
                    }

                    this.log('  - build unit type [' + unit.unit + '] at ('
                        + spawn[0] + ', ' + spawn[1] + ')');
                    return this.build_unit(
                        unit.unit, spawn[0] - this.me.x, spawn[1] - this.me.y);
                }
            }

            // handle radio signals
            let next_signal = this.signal_queue.shift();
            if (next_signal != undefined && next_signal.signal >= 0xd000) {
                let fallen = this.decode_coordinates(
                    next_signal.signal - 0xd000);
                // check coordinates
                if (fallen[0] == this.objective[0]
                        && fallen[1] == this.objective[1]
                        && this.objectives.length > 1) {
                    // FIXME: send this earlier
                    castle_talk_value = 0xF0 + this.castle_order;
                    this.objectives.shift();
                    this.objective = this.objectives[0];
                    this.signal(this.encode_coordinates(this.objective),
                                this.distance([this.me.x, this.me.y],
                                              next_signal.coordinates));
                }
            }
        }

        else if (this.me.unit == SPECS.CHURCH) {
            this.log('Church [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            // clear castle talk by default
            let castle_talk_value = 0x00;

            let visibles = this.get_visible_robots();

            if (step == 0) {
                this.symmetry = this.determine_map_symmetry();

                // TODO: contingency for when no resources are found
                this.local_resources.push({
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.karbonite_map), 26)),
                    occupied: [],
                    index: 0 });
                this.local_resources.push({
                    locations: this.order_by_onion_path_length(
                        this.filter_by_distance_less_than(
                            this.get_resources(this.fuel_map), 26)),
                    occupied: [],
                    index: 0 });

                let pilgrims = this.filter_allied_pilgrim_coordinates(visibles);
                // assume pilgrims target only karbonite patches
                for (let i = 0; i < pilgrims.length; i++) {
                    if (this.is_resource(pilgrims[i], this.karbonite_map)) {
                        this.local_resources[0].occupied.push(pilgrims[i]);
                        this.local_resources[0].index++;
                    }
                }

                this.objective = this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]);
            }

            if (step == 0) {
                castle_talk_value = this.me.x + 0x70;
            }

            else if (step == 1) {
                castle_talk_value = this.me.y + 0x70;
            }

            this.castle_talk(castle_talk_value);

            let enemies = this.filter_visible_enemy_robots(visibles);

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

            if (step == 0) {
                this.enqueue_unit(SPECS.PROPHET, null, null);
            }

            // FIXME: units in the build queue are not guaranteed to actually
            // be built
            for (let i = 0; i < 2; i++) {
                if (this.unit_queue.length == 0) {
                    let square = this.next_available_resource_from(
                        this.local_resources[i]);
                    if (square != null) {
                        if (this.enqueue_unit(SPECS.PILGRIM, square, square)) {
                            this.local_resources[i].index++;
                            this.local_resources[i].occupied[square] = true;
                        }
                    }
                }
            }

            if (this.unit_queue.length == 0) {
                if (step > 10 && this.is_available(80, 200)) {
                    this.enqueue_unit(SPECS.PROPHET, null, null);
                }
            }

            if (this.unit_queue.length > 0) {
                let unit = this.unit_queue.shift();

                let spawn = this.get_buildable_square_closest_by_distance_to(
                        unit.target);

                if (spawn != null) {
                    const signal = unit.signal;
                    if (signal != null) {
                        this.signal(this.encode_coordinates(signal),
                                    this.distance([this.me.x, this.me.y],
                                                  spawn) + 1);
                    }

                    this.log('  - build unit type [' + unit.unit + '] at ('
                        + spawn[0] + ', ' + spawn[1] + ')');
                    return this.build_unit(
                        unit.unit, spawn[0] - this.me.x, spawn[1] - this.me.y);
                }
            }
        }

        else if (this.me.unit == SPECS.PILGRIM) {
            this.log('Pilgrim [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            // listen to radio for directions from the castle/church
            if (step === 0) {
                this.fountain = this.get_adjacent_deposit_point();

                this.symmetry = this.determine_map_symmetry();
            }

            let visibles = this.get_visible_robots();

            let radioing = this.filter_allied_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (robot.unit < 2 && this.memory == null) {
                    this.target = this.decode_coordinates(robot.signal);
                    this.memory = this.target;
                    break;
                }
            }

            // clear target destination after arrival
            if (this.target != null
                    && this.target[0] == this.me.x
                    && this.target[1] == this.me.y) {
                this.target = null;

                // TODO: more reliable conditions to determine if on church
                // building mission would be nice
                if (this.is_on_resource(this.karbonite_map)
                        && this.get_adjacent_deposit_point() == null
                        && this.distance([this.me.x, this.me.y],
                                         this.fountain) > 25) {
                    let church_square =
                        this.get_buildable_square_by_adjacent_resources();
                    if (church_square != null) {
                        this.fountain = church_square;
                        this.log('  - build unit type [2] at ('
                            + church_square[0] + ', ' + church_square[1] + ')');
                        return this.build_unit(SPECS.CHURCH,
                                               church_square[0] - this.me.x,
                                               church_square[1] - this.me.y);
                    }
                }
            }

            let enemies = this.filter_attack_capable_robots(
                this.filter_visible_enemy_robots(visibles));

            let attacked_count = 0;
            for (let i = 0; i < enemies.length; i++) {
                let enemy = enemies[i];
                if (this.is_in_attack_range_of(enemy)) {
                    attacked_count++;
                }
            }

            if (attacked_count > 0) {
                // evade enemies by moving to edge of map
                // TODO: be careful not to be overly scared
                this.mode = 1;
            }

            else if (enemies.length > 0) {
                let enemies_by_units = this.group_by_unit_types(enemies);
                if (enemies_by_units[SPECS.CRUSADER].length > 0) {
                    let nearest_crusader = this.get_closest_robot(
                        enemies_by_units[SPECS.CRUSADER]);
                    if (this.distance([nearest_crusader.x, nearest_crusader.y],
                                      [this.me.x, this.me.y]) <= 20) {
                        this.mode = 1;
                    }

                    // TODO: refactor this to avoid duplication
                    else if (this.me.karbonite > 9 || this.me.fuel > 49) {
                        // trigger deposit if enemies are closing in
                        if (this.is_adjacent(this.fountain)
                                && (this.me.karbonite || this.me.fuel)) {
                            this.log('  - depositing resources [emergency]');
                            return this.give(this.fountain[0] - this.me.x,
                                             this.fountain[1] - this.me.y,
                                             this.me.karbonite, this.me.fuel);
                        }
                    }
                }

                else if (this.me.karbonite > 9 || this.me.fuel > 49) {
                    // trigger deposit if enemies are closing in
                    if (this.is_adjacent(this.fountain)
                            && (this.me.karbonite || this.me.fuel)) {
                        this.log('  - depositing resources [emergency]');
                        return this.give(this.fountain[0] - this.me.x,
                                         this.fountain[1] - this.me.y,
                                         this.me.karbonite, this.me.fuel);
                    }
                }
            }

            else if (this.mode > 0) {
                this.target = null;
                this.mode = 0;
            }

            if (this.mode == 1) {
                this.target = this.get_square_away_from_symmetry_axis();
            }

            // mine resources if safe and appropriate
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

            // TODO: always check and update for adjacent deposit points
            // possible to try to build churches in the path between the
            // resource and the original 'birth' castle/church

            // TODO: deposit resources more frequently if close to
            // castle/church so that units may be built earlier

            if (this.is_adjacent(this.fountain)
                    && (this.me.karbonite || this.me.fuel)) {
                this.target = null;
                this.log('  - depositing resources');
                return this.give(this.fountain[0] - this.me.x,
                                 this.fountain[1] - this.me.y,
                                 this.me.karbonite, this.me.fuel);
            }

            // return to nearest resource deposit point
            if (this.mode == 0
                    && (this.me.karbonite > 18 || this.me.fuel > 90)) {
                this.target = this.fountain;
            }

            // attempt to target remembered resource after any interruption
            // (deposition, evasion, etc..)
            if (this.target == null && this.memory != null) {
                this.target = this.memory;
            }

            this.log('  target: ' + this.target);

            this.path = this.get_pilgrimage_path_to(this.target);

            // proceed to target
            if (this.path != null && this.path.length > 0) {
                let destination = this.get_next_step_on(this.path);
                this.log('  - moving to destination: ('
                    + destination[0] + ', ' + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }

        else if (this.me.unit == SPECS.CRUSADER) {
            this.log('Crusader [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            if (step === 0) {
                // TODO: also save robot id for castle talk identification
                this.fountain = this.get_adjacent_deposit_point();
            }

            let visibles = this.get_visible_robots();

            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (robot.unit == 0 && robot.x == this.fountain[0]
                        && robot.y == this.fountain[1]) {
                    if (this.target == null) {
                        this.target = this.decode_coordinates(robot.signal);
                        this.memory = this.target;
                        this.objective = this.target;
                        break;
                    }
                }
            }

            // TODO: abstract target priority function, combining the two
            // blocks below
            // TODO: general ideas:
            //     [1]: if overwhelmed and castle is attackable, attack castle
            //     [2]: if overwhelmed but reinforcements are close, retreat
            //     [3]: if around equal, stand ground and attack (with
            //     priorities)

            // NOTES:
            //     memory: long-term target location (only castles)
            //     objective: current enemy target location
            //     victim: short-term enemy robot object

            let enemies = this.filter_visible_enemy_robots(visibles);

            // identify castle if it is within range
            if (this.memory != null
                    && this.distance([this.me.x, this.me.y],
                                     this.memory) < 50) {
                let castle_prescence = null;
                for (let i = 0; i < enemies.length; i++) {
                    if (enemies[i].unit == 0) {
                        castle_prescence = enemies[i];
                        break;
                    }
                }

                if (castle_prescence == null) {
                    let signal_value = this.encode_coordinates(
                        [this.memory[0], this.memory[1]]) + 0xd000;
                    this.signal(signal_value, this.distance(
                        [this.me.x, this.me.y], this.fountain));

                    this.victim = null;
                    this.objective = null;
                    this.memory = null;

                    this.target = null;
                }
            }

            // start with victim (target to focus)
            // this usually is either the last enemy attacked, or the castle
            // TODO: use victim to remember attacked units - preferentially
            // attacked since they have lower health
            if (this.victim != null && this.is_alive(this.victim)) {
                if (this.is_in_attack_range(this.victim)) {
                    this.log('  - attack unit [' + this.victim.id
                        + '], type (' + this.victim.unit + ') at '
                        + this.victim.x + ', ' + this.victim.y);
                    return this.attack(this.victim.x - this.me.x,
                                       this.victim.y - this.me.y);
                }
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

            // proceed to target destination
            if (this.path != null && this.path.length > 0) {
                let destination = this.get_next_step_on(this.path);
                this.log('  - moving to destination: (' + destination[0] + ', '
                    + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }

        else if (this.me.unit == SPECS.PROPHET) {
            this.log('Prophet [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            if (step === 0) {
                // TODO: also save robot id for castle talk identification
                this.fountain = this.get_adjacent_deposit_point();
            }

            let visibles = this.get_visible_robots();

            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (robot.unit == 0 && robot.x == this.fountain[0]
                        && robot.y == this.fountain[1]) {
                    this.log('DEBUG: RADIO: receive target info');
                    if (this.memory == null) {
                        this.log('DEBUG: RADIO: acquire target info');
                        this.memory = this.decode_coordinates(robot.signal);
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

            if (this.is_adjacent(this.fountain)) {
                // move off buildable squares
                this.target = this.get_closest_square_by_distance(
                    this.get_next_to_adjacent_passable_empty_squares_at(
                        this.fountain));
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

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_to(this.target);

            this.log('  target: ' + this.target);

            // proceed to target destination
            if (this.path != null && this.path.length > 0) {
                let destination = this.get_next_step_on(this.path);
                this.log('  - moving to destination: (' + destination[0] + ', '
                    + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }

        else if (this.me.unit == SPECS.PREACHER) {
            this.log('Preacher [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            if (step === 0) {
                // TODO: also save robot id for castle talk identification
                this.fountain = this.get_adjacent_deposit_point();
            }

            let visibles = this.get_visible_robots();

            let radioing = this.filter_radioing_robots(visibles);
            for (let i = 0; i < radioing.length; i++) {
                let robot = radioing[i];
                if (robot.unit == 0 && robot.x == this.fountain[0]
                        && robot.y == this.fountain[1]) {
                    this.log('DEBUG: RADIO: receive target info');
                    if (this.memory == null) {
                        this.log('DEBUG: RADIO: acquire target info');
                        this.memory = this.decode_coordinates(robot.signal);
                        break;
                    }
                }
            }

            // TODO: special aoe targetting for preachers

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

            if (this.is_adjacent(this.fountain)) {
                // move off buildable squares
                this.target = this.get_closest_square_by_distance(
                    this.get_next_to_adjacent_passable_empty_squares_at(
                        this.fountain));
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

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_to(this.target);

            this.log('  target: ' + this.target);

            // proceed to target destination
            if (this.path != null && this.path.length > 0) {
                let destination = this.get_next_step_on(this.path);
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

    is_radioing(robot) {
        return this.isRadioing(robot);
    }

    is_visible(robot) {
        return this.isVisible(robot);
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
            }

            else if (!(karbonite_map[coord[1]][this.size - 1 - coord[0]])
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

    get_square_away_from_symmetry_axis() {
        let square = [this.me.x, this.me.y];
        let major = square[this.symmetry];
        let side = (major > this.map.length / 2);

        square[this.symmetry] = side ? Math.min(major + 3, this.size - 1) :
            Math.max(major - 3, 0);

        return square;
    }

    /*
     * map
     */

    is_passable(square) {
        let x = square[0];
        let y = square[1];

        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            return false;
        }

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
            return false;
        }

        let nonempty = this.get_visible_robot_map();

        return this.map[y][x] && (nonempty[y][x] < 1);
    }

    is_adjacent(square) {
        return (this.distance([this.me.x, this.me.y], square) < 3);
    }

    are_adjacent(square, target) {
        return (this.distance(square, target) < 3);
    }

    is_buildable(square) {
        return this.is_passable_and_empty(square);
    }

    count_impassable_squares_around(square) {
        let count = 0;

        let x = square[0];
        let y = square[1];
        for (let i = -4; i < 5; i++) {
            for (let j = -4; j < 5; j++) {
                if (!this.is_passable([y + j, x + i])) {
                    count++;
                }
            }
        }

        return count;
    }

    get_adjacent_deposit_point() {
        let visibles = this.get_visible_robots();
        for (let i = 0; i < visibles.length; i++) {
            if (visibles[i].unit < 2 && visibles[i].team == this.me.team) {
                if (this.is_adjacent([visibles[i].x, visibles[i].y])) {
                    return [visibles[i].x, visibles[i].y];
                }
            }
        }

        return null;
    }

    get_adjacent_passable_squares() {
        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let adjx = this.me.x + this.compass[i][0];
            let adjy = this.me.y + this.compass[i][1];
            if (this.is_passable([adjx, adjy])) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_adjacent_passable_empty_squares() {
        let adjacent = [];

        for (let i = 0; i < 8; i++) {
            let adjx = this.me.x + this.compass[i][0];
            let adjy = this.me.y + this.compass[i][1];
            if (this.is_passable_and_empty([adjx, adjy])) {
                adjacent.push([adjx, adjy]);
            }
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
                adjacent.push([adjx, adjy]);
            }
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
                adjacent.push([adjx, adjy]);
            }
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
                next_to_adjacent.push([adjx, adjy]);
            }
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

    distance(r, s) {
        return (r[0] - s[0]) * (r[0] - s[0]) + (r[1] - s[1]) * (r[1] - s[1]);
    }

    get_closest_distance(square, targets) {
        if (targets.length == 0) {
            return null;
        }

        let minimum = 16384;
        for (let i = 0; i < targets.length; i++) {
            let distance = this.distance(square, targets[i]);
            if (distance < minimum) {
                minimum = distance;
            }
        }

        return minimum;
    }

    get_closest_square_by_distance(squares) {
        if (squares.length == 0) {
            return null;
        }

        let index = 0;
        let minimum = 16384;
        for (let i = 0; i < squares.length; i++) {
            let distance = this.distance([this.me.x, this.me.y], squares[i]);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return squares[index];
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
                    resources.push([j, i]);
                }
            }
        }

        return resources;
    }

    count_resource_squares_around(square) {
        let adjacent = this.get_adjacent_passable_squares_at(square);

        let count = 0;
        for (let i = 0; i < adjacent.length; i++) {
            if (this.is_resource(adjacent[i], this.karbonite_map)
                    || this.is_resource(adjacent[i], this.fuel_map)) {
                count++;
            }
        }

        return count;
    }

    next_available_resource_from(resource) {
        if (resource.index < resource.locations.length) {
            for (let i = 0; i < resource.locations.length; i++) {
                if (!resource.occupied[resource.locations[i]]) {
                    return resource.locations[i];
                }
            }
        }

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

    astar(start, end, adjacency) {
        let trace = {};

        let G = {};
        let open_squares = {};

        G[start] = 0;
        open_squares[start] = this.distance(start, end);

        let closed_squares = {};

        while (Object.keys(open_squares).length > 0) {
            let head = null;
            let score = 0;

            for (let square in open_squares) {
                let square_score = open_squares[square];
                if (head == null || square_score < score) {
                    head = JSON.parse('[' + square + ']');
                    score = square_score;
                }
            }

            if (head[0] == end[0] && head[1] == end[1]) {
                let path = [head];
                while (head in trace) {
                    head = trace[head];
                    path.push(head);
                }
                path.reverse();
                path.splice(0, 1);
                return path;
            }

            delete open_squares[head];
            closed_squares[head] = 0;

            let adjacent = adjacency(head);
            for (let i = 0; i < adjacent.length; i++) {
                let square = adjacent[i];

                if (closed_squares[square] == 0) {
                    continue;
                }

                let total = G[head] + this.distance(head, square);

                if (open_squares[square] != undefined && total >= G[square]) {
                    continue;
                }

                trace[square] = head;

                G[square] = total;
                open_squares[square] = total + this.distance(square, end);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    astar_companion(start, end, adjacency) {
        let trace = {};

        let G = {};
        let open_squares = {};

        G[start] = 0;
        open_squares[start] = this.distance(start, end);

        let closed_squares = {};

        while (Object.keys(open_squares).length > 0) {
            let head = null;
            let score = 0;

            for (let square in open_squares) {
                let square_score = open_squares[square];
                if (head == null || square_score < score) {
                    head = JSON.parse('[' + square + ']');
                    score = square_score;
                }
            }

            if (this.are_adjacent(head, end)) {
                let path = [head];
                while (head in trace) {
                    head = trace[head];
                    path.push(head);
                }
                path.reverse();
                path.splice(0, 1);
                return path;
            }

            delete open_squares[head];
            closed_squares[head] = 0;

            let adjacent = adjacency(head);
            for (let i = 0; i < adjacent.length; i++) {
                let square = adjacent[i];

                if (closed_squares[square] == 0) {
                    continue;
                }

                let total = G[head] + this.distance(head, square);

                if (open_squares[square] != undefined && total >= G[square]) {
                    continue;
                }

                trace[square] = head;

                G[square] = total;
                open_squares[square] = total + this.distance(square, end);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    get_two_onion_rings_around(square) {
        const ring_two = [
            [0, -2], [1, -1], [2, 0], [1, 1],
            [0, 2], [-1, 1], [-2, 0], [-1, -1]];
        const ring_one = [
            [0, -1], [1, 0], [0, 1], [-1, 0]];

        // FIXME: test efficiency of pruning
        const ring_one_exclusions = [
            [[-1, -1], [0, -2], [1, -1]], [[1, -1], [2, 0], [1, 1]],
            [[1, 1], [0, 2], [-1, 1]], [[-1, 1], [-2, 0], [-1, -1]]];

        let adjacent = [];
        for (let i = 0; i < 8; i++) {
            let rngx = square[0] + ring_two[i][0];
            let rngy = square[1] + ring_two[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        for (let i = 0; i < 4; i++) {
            let rngx = square[0] + ring_one[i][0];
            let rngy = square[1] + ring_one[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
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

        // FIXME: test efficiency of pruning
        const ring_two_exclusions = [
            [[-1, -2], [0, -3], [1, -2]], [[1, -2], [2, -1]],
            [[2, -1], [3, 0], [2, 1]], [[2, 1], [1, 2]],
            [[1, 2], [0, 3], [-1, 2]], [[-1, 2], [-2, 1]],
            [[-2, 1], [-3, 0], [-2, -1]], [[-2, -1], [-1, -2]]];
        const ring_one_exclusions = [
            [[-1, -1], [0, -2], [1, -1]], [[1, -1], [2, 0], [1, 1]],
            [[1, 1], [0, 2], [-1, 1]], [[-1, 1], [-2, 0], [-1, -1]]];

        let x = square[0];
        let y = square[1];

        let adjacent = [];
        for (let i = 0; i < 16; i++) {
            let rngx = x + ring_three[i][0];
            let rngy = y + ring_three[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        for (let i = 0; i < 8; i++) {
            let rngx = x + ring_two[i][0];
            let rngy = y + ring_two[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        for (let i = 0; i < 4; i++) {
            let rngx = x + ring_one[i][0];
            let rngy = y + ring_one[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        return adjacent;
    }

    onion_search(start, end, range, layering) {
        let trace = {};

        let G = {};
        let open_squares = {};

        G[start] = 0;
        open_squares[start] = this.distance(start, end);

        let closed_squares = {};

        while (Object.keys(open_squares).length > 0) {
            let head = null;
            let score = 0;

            for (let square in open_squares) {
                let square_score = open_squares[square];
                if (head == null || square_score < score) {
                    head = JSON.parse('[' + square + ']');
                    score = square_score;
                }
            }

            if (this.distance(head, end) <= range) {
                let path = [end, head];
                while (head in trace) {
                    head = trace[head];
                    path.push(head);
                }
                path.reverse();
                path.splice(0, 1);
                return path;
            }

            delete open_squares[head];
            closed_squares[head] = 0;

            let adjacent = layering(head);
            for (let i = 0; i < adjacent.length; i++) {
                let square = adjacent[i];

                if (closed_squares[square] == 0) {
                    continue;
                }

                let total = G[head] + this.distance(head, square);

                if (open_squares[square] != undefined && total >= G[square]) {
                    continue;
                }

                trace[square] = head;

                G[square] = total;
                open_squares[square] = total + this.distance(square, end);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    total_path_distance(path) {
        let total = 0;
        for (let i = 1; i < path.length; i++) {
            total += this.distance(path[i], path[i - 1]);
        }

        return total;
    }

    get_next_step_on(path) {
        const movement_speed = [0, 0, 4, 9, 4, 4];
        const range = movement_speed[this.me.unit];

        let next = null;
        for (let i = 1; i < path.length; i++) {
            if (this.distance([this.me.x, this.me.y], path[i]) > range) {
                next = path[i - 1];
                break;
            }
        }

        if (next == null) {
            next = path[path.length - 1];
        }

        return next;
    }

    order_by_astar_path_length_to(squares) {
        let paths = [];
        let ordered = [];

        for (let i = 0; i < squares.length; i++) {
            paths.push(this.astar([this.me.x, this.me.y], squares[i],
                this.get_adjacent_passable_squares_at.bind(this)));
        }

        paths.sort(function(r, s) { return r.length - s.length; });

        for (let i = 0; i < paths.length; i++) {
            let path = paths[i];
            ordered.push([path[path.length - 1], path[0], path.length]);
        }

        return ordered;
    }

    order_by_onion_path_length(squares) {
        let paths = [];

        for (let i = 0; i < squares.length; i++) {
            paths.push(this.onion_search(
                [this.me.x, this.me.y], squares[i], 4,
                this.get_two_onion_rings_around.bind(this)));
        }

        paths.sort(function(r, s) { return r.length - s.length; });

        let ordered = [];

        for (let i = 0; i < paths.length; i++) {
            ordered.push(paths[i][paths[i].length - 1]);
        }

        return ordered;
    }

    /*
     * high-level optimisations
     */

    get_buildable_square_closest_by_distance_to(target) {
        let adjacent = this.get_buildable_squares();

        if (adjacent.length == 0) {
            return null;
        }

        if (target == null) {
            return adjacent[Math.random() * adjacent.length];
        }

        else if (this.is_adjacent(target)) {
            return target;
        }

        let distances = [];

        for (let i = 0; i < adjacent.length; i++) {
            let square = adjacent[i];
            distances.push(this.total_path_distance(this.onion_search(
                square, target, 4,
                this.get_two_onion_rings_around.bind(this))));
        }

        if (distances.length == 0) {
            return null;
        }

        return adjacent[this.index_of_minimum_element_in(distances)];
    }

    get_buildable_square_by_adjacent_resources() {
        let adjacent = this.get_buildable_squares();

        if (adjacent.length == 0) {
            return null;
        }

        let counts = [];

        for (let i = 0; i < adjacent.length; i++) {
            counts.push(this.count_resource_squares_around(adjacent[i]) * 10
                - this.count_impassable_squares_around(adjacent[i]));
        }

        return adjacent[this.index_of_maximum_element_in(counts)];
    }

    get_pilgrimage_path_to(target) {
        if (target == null) {
            return null;
        }

        if (target[0] == this.fountain[0] && target[1] == this.fountain[1]) {
            return this.astar_companion([this.me.x, this.me.y], this.fountain,
                this.get_adjacent_passable_empty_squares_at.bind(this));
        }

        let final_target = this.adjust_target_for_obstructions(target);
        if (final_target != null) {
            return this.onion_search([this.me.x, this.me.y], final_target, 4,
                this.get_two_onion_rings_around.bind(this));
        }

        return null;
    }

    adjust_target_for_obstructions(target) {
        // assume target is never null
        if (!this.is_passable_and_empty(target)) {
            if (this.is_adjacent(target)) {
                return null;
            }

            let adjacent = this.get_adjacent_passable_empty_squares_at(target);
            let closest = this.get_closest_square_by_distance(adjacent);

            if (closest != null) {
                return closest;
            }

            return this.get_closest_square_by_distance(
                this.get_next_to_adjacent_passable_empty_squares_at(target));
        }

        return target;
    }

    get_final_target_for(target) {
        if (target != null) {
            if (!this.is_passable_and_empty(target)) {
                target = this.smear_centred(target);
            }
        }

        return target;
    }

    smear_centred(square) {
        let squares = this.get_adjacent_passable_empty_squares_at(square);

        if (squares.length == 0) {
            squares = this.get_next_to_adjacent_passable_empty_squares_at(
                square);
        }

        if (squares.length > 0) {
            return squares[Math.floor(Math.random() * squares.length)];
        }

        return null;
    }

    get_path_to(target) {
        if (target == null) {
            return null;
        }

        if (this.me.unit == SPECS.CRUSADER) {
            return this.onion_search([this.me.x, this.me.y], target, 9,
                this.get_three_onion_rings_around.bind(this));
        }

        return this.onion_search([this.me.x, this.me.y], target, 4,
            this.get_two_onion_rings_around.bind(this));
    }

    /*
     * signals
     */

    encode_coordinates(square) {
        if (square == null) {
            return 0;
        }

        return (square[0] | square[1] << 6);
    }

    decode_coordinates(signal) {
        return [signal & 0x003f, (signal & 0x0fc0) >> 6];
    }

    add_message(id, message) {
        if (!this.messages[id]) {
            this.messages[id] = [];
        }

        this.messages[id].push(message);
    }

    replace_coordinates(coordinates) {
        for (let i = 0; i < this.deposit_points.length; i++) {
            if (this.are_adjacent(coordinates, this.deposit_points[i])) {
                this.deposit_points[i] = coordinates.slice();
                break;
            }
        }
    }

    /*
     * filters
     */

    filter_by_map_symmetry(squares) {
        if (this.symmetry == null) {
            return [];
        }

        let square = [this.me.x, this.me.y];
        let side = (square[this.symmetry] > this.map.length / 2);

        let filtered = [];
        for (let i = 0; i < squares.length; i++) {
            if ((squares[i][this.symmetry] > this.map.length / 2) == side) {
                filtered.push(squares[i]);
            }
        }

        return filtered;
    }

    filter_by_distance_less_than(squares, value) {
        let filtered = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if (this.distance([this.me.x, this.me.y], square) < value) {
                filtered.push(square);
            }
        }

        return filtered;
    }

    filter_by_nearest_distance_greater_than(squares, references, value) {
        let filtered = [];

        for (let i = 0; i < squares.length; i++) {
            let square = squares[i];
            if (this.get_closest_distance(square, references) > value) {
                filtered.push(square);
            }
        }

        return filtered;
    }

    filter_robots_by_distance_less_than(robots, value) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.distance([this.me.x, this.me.y],
                              [robot.x, robot.y]) < value) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_castling_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team == this.me.team && robot.castle_talk != 0) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_radioing_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_radioing(robot)) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_allied_radioing_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_radioing(robot) && robot.id != this.me.id
                    && robot.team == this.me.team) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_allied_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team == this.me.team) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_allied_pilgrim_coordinates(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team == this.me.team && robot.unit == SPECS.PILGRIM) {
                filtered.push([robot.x, robot.y]);
            }
        }

        return filtered;
    }

    filter_enemy_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.team != this.me.team) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_visible_enemy_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_visible(robot) && robot.team != this.me.team) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_attackable_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (this.is_in_attack_range(robot)) {
                filtered.push(robot);
            }
        }

        return filtered;
    }

    filter_attack_capable_robots(robots) {
        let filtered = [];

        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            if (robot.unit > 2) {
                filtered.push(robot);
            }
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

        let range = this.distance([this.me.x, this.me.y], [robot.x, robot.y]);
        return ((range <= max_attack_range[this.me.unit])
            && (range >= min_attack_range[this.me.unit]));
    }

    is_in_attack_range_of(robot) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 26];

        let range = this.distance([this.me.x, this.me.y], [robot.x, robot.y]);
        return ((range <= max_attack_range[robot.unit])
            && (range >= min_attack_range[robot.unit]));
    }

    unit_count(square, robot_map) {
        let robot_id = robot_map[square[1]][square[0]];
        if (robot_id < 1) {
            return 0;
        }

        let robot = this.get_robot(robot_id);
        if (robot.team == this.me.team) {
            return -1;
        }

        return 1;
    }

    get_unit_count_difference_around(square) {
        let robot_map = this.get_visible_robot_map();

        let count = this.unit_count(square, robot_map);

        let adjacent = this.get_adjacent_passable_squares_at(square);
        for (let i = 0; i < adjacent.length; i++) {
            count += this.unit_count(adjacent[i], robot_map);
        }

        return count;
    }

    get_closest_robot(robots) {
        if (robots.length == 0) {
            return null;
        }

        let index = 0;
        let minimum = 100;
        for (let i = 0; i < robots.length; i++) {
            let robot = robots[i];
            let distance = this.distance([this.me.x, this.me.y],
                                         [robot.x, robot.y]);
            if (distance < minimum) {
                index = i;
                minimum = distance;
            }
        }

        return robots[index];
    }

    get_coordinates_of_closest_robot(robots) {
        let robot = this.get_closest_robot(robots);

        if (robot == null) {
            return null;
        }

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

    evaluate_castle_safety(visibles, enemies) {
        if (enemies.length == 0) {
            return 0;
        }

        let comrades = this.filter_robots_by_distance_less_than(
            this.filter_allied_robots(visibles), 10);
        let enemies_by_units = this.group_by_unit_types(enemies);
        let comrades_by_units = this.group_by_unit_types(comrades);

        if (enemies_by_units[4].length > comrades_by_units[4].length) {
            return 1;
        }

        if (enemies_by_units[3].length > comrades_by_units[5].length + 1) {
            return 2;
        }

        if (enemies_by_units[5].length > comrades_by_units[4].length) {
            let nearest = this.get_closest_robot(enemies_by_units[5]);

            if (this.distance([this.me.x, this.me.y],
                              [nearest.x, nearest.y]) <= 25) {
                return 2;
            }

            else {
                return 1;
            }
        }

        // not necessary to build new units, try attacking
        return 3;
    }

    evaluate_church_safety(visibles, enemies) {
        if (enemies.length == 0) {
            return 0;
        }

        let comrades = this.filter_robots_by_distance_less_than(
            this.filter_allied_robots(visibles), 10);
        let enemies_by_units = this.group_by_unit_types(enemies);
        let comrades_by_units = this.group_by_unit_types(comrades);

        if (enemies_by_units[4].length > comrades_by_units[4].length) {
            return 1;
        }

        if (enemies_by_units[3].length > comrades_by_units[5].length) {
            return 2;
        }

        if (enemies_by_units[5].length > comrades_by_units[4].length) {
            let nearest = this.get_closest_robot(enemies_by_units[5]);

            if (this.distance([this.me.x, this.me.y],
                              [nearest.x, nearest.y]) <= 25) {
                return 2;
            }

            else {
                return 1;
            }
        }

        // churches cannot attack, so there must always be a response
        return 1;
    }

    get_attack_target_from(attackables, priority) {
        if (attackables.length == 0) {
            return null;
        }

        let attackables_by_units = this.group_by_unit_types(attackables);
        for (let i = 0; i < priority.length; i++) {
            let order = priority[i];
            if (attackables_by_units[order].length > 0) {
                return this.get_closest_robot(attackables_by_units[order]);
            }
        }
    }

    get_splash_attack_at(target) {
        let square = target;
        let max_count = this.get_unit_count_difference_around(target);

        let adjacent = this.get_adjacent_passable_squares_at(target);
        for (let i = 0; i < adjacent.length; i++) {
            let count = this.get_unit_count_difference_around(adjacent[i]);
            if (count > max_count) {
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
                + this.count_impassable_squares_around(square));
        }

        return safety;
    }

    get_church_candidate(resources, allied_bases, enemy_bases) {
        let safety = this.evaluate_safety_for_each(
            resources, allied_bases, enemy_bases);

        let index = this.index_of_maximum_element_in(safety);
        if (index != null) {
            return resources[index];
        }

        return null;
    }

    /*
     * array helpers
     */

    index_of_minimum_element_in(values) {
        if (values.length == 0) {
            return null;
        }

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
        if (values.length == 0) {
            return null;
        }

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
