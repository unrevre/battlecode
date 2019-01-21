import {BCAbstractRobot, SPECS} from 'battlecode';

let step = -1;

class MyRobot extends BCAbstractRobot {
    constructor() {
        super();

        this.compass = [
            [0, -1], [1, 0], [-1, 0], [0, 1],
            [-1, 1], [-1, -1], [1, -1], [1, 1]
        ];

        this.unit_karbonite_costs = [0, 50, 10, 15, 25, 30];
        this.unit_fuel_costs = [0, 200, 50, 50, 50, 50];

        this.size = null;
        this.symmetry = null;

        this.castles = 0;
        this.castle_order = null;
        this.castle_coords = [];

        this.castle_locations = [];

        this.objectives = [];
        this.objective = null;

        this.ordered_karbonite = [];
        this.ordered_fuel = [];

        this.index_karbonite = 0;
        this.index_fuel = 0;

        this.queue_unit = [];
        this.queue_spawn = [];
        this.queue_signal = [];
        this.queue_destination = [];

        this.fountain = null;
        this.birthplace = null;
        this.memory = null;
        this.victim = null;

        this.target = null;
        this.path = null;

        this.current_rusher = 0;

        this.mode = 0;
        this.churches = 0;
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
                this.symmetry = this.guess_map_symmetry();

                // TODO: contingency for when no resources are found
                this.ordered_karbonite = this.order_resources(
                    this.filter_by_map_symmetry(this.get_local_resources(
                        this.karbonite_map)));
                this.ordered_fuel = this.order_resources(
                    this.filter_by_map_symmetry(this.get_local_resources(
                        this.fuel_map)));

                this.objective = this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]);

                this.castle_locations.push([this.me.x, this.me.y]);
            }

            // clear castle talk by default
            var castle_talk_value = 0x00;

            var visibles = this.get_visible_robots();
            var enemies = this.filter_visible_enemies(visibles);
            var attackables = this.filter_enemy_attackables(enemies);

            var castle_safety = this.get_castle_defence_status(
                visibles, enemies);

            if (castle_safety == 0) {
                if (this.castle_order == 0 && step > 10
                        && this.churches * 16 < step
                        && this.karbonite > 80 && this.fuel > 300) {
                    var target_church = this.get_church_candidate(
                        this.filter_by_nearest_distance(
                            this.get_resources(this.karbonite_map),
                            this.castle_locations),
                        this.castle_locations);
                    this.log('DEBUG: CHURCH: ' + target_church);
                    this.enqueue_unit(
                        SPECS.PILGRIM, 2,
                        this.encode_coordinates(target_church), null);
                    this.churches++;
                }
            }

            else if (castle_safety == 3) {
                var prey = this.get_attack_target_from(attackables,
                                                       [4, 5, 2, 3, 1, 0]);
                if (prey != null) {
                    this.log('  - attack unit [' + prey.id + '], type ('
                        + prey.unit + ') at ' + (prey.x - this.me.x) + ', '
                        + (prey.y - this.me.y));
                    return this.attack(prey.x - this.me.x, prey.y - this.me.y);
                }
            }

            else {
                this.queue_unit.length = 0;
                this.queue_spawn.length = 0;
                this.queue_signal.length = 0;

                var nearest_enemy = this.get_nearest_unit(enemies);
                var signal_value = this.encode_coordinates(this.objective);
                if (castle_safety == 1) {
                    this.enqueue_unit(SPECS.PROPHET, 0, signal_value, null);
                }

                else {
                    this.enqueue_unit(SPECS.PREACHER, 0, signal_value,
                                      nearest_enemy);
                }
            }

            // TODO: defend with (stationary) prophets against enemies

            // signal veto to avoid multiple broadcasts overriding each other
            var signal_veto = false;

            // check castle talk - abuse all information available
            var castling = this.filter_castling_robots(visibles);
            for (var i = 0; i < castling.length; i++) {
                var robot = castling[i];
                if (robot.id != this.me.id) {
                    if (step < 3) {
                        this.castles++;
                        this.castle_coords.push(robot.castle_talk - 0x80);
                    }

                    else if (robot.castle_talk >= 0xF0) {
                        this.mode = 1;
                        this.current_rusher = robot.castle_talk - 0xF0 + 1;
                    }
                }
            }

            if (step == 0) {
                this.castle_order = this.castle_coords.length;
            }

            else if (step == 2) {
                this.castles /= 2;
                for (var i = 0; i < this.castles; i++) {
                    var coords = [this.castle_coords[i],
                                  this.castle_coords[i + this.castles]];
                    this.objectives.push(
                        this.reflect_about_symmetry_axis(coords));
                    this.castle_locations.push(coords);
                }
            }

            // check radioing units - team available for castles
            var radioing = this.filter_radioing_robots(visibles);
            for (var i = 0; i < radioing.length; i++) {
                var robot = radioing[i];
                var radio_signal = robot.signal;

                // TODO: put such signals in a queue and handle one-by-one,
                // this is not urgent
                if (radio_signal >= 0xd000) {
                    var fallen = this.decode_coordinates(
                        radio_signal - 0xd000);
                    // check coordinates
                    if (fallen[0] == this.objective[0]
                            && fallen[1] == this.objective[1]
                            && this.objectives.length > 0) {
                        this.objective = this.objectives.shift();
                        castle_talk_value = 0xF0 + this.castle_order;
                        this.signal(this.encode_coordinates(this.objective),
                                    this.distance([this.me.x, this.me.y],
                                                  [robot.x, robot.y]));
                        signal_veto = true;
                    }
                }
            }

            // broadcast coordinates (highest 4 bits)
            if (step == 0) {
                castle_talk_value = this.me.x + 0x80;
            }

            else if (step == 1) {
                castle_talk_value = this.me.y + 0x80;
            }

            this.castle_talk(castle_talk_value);

            // TODO: decide units/target resource based on distribution of
            // resources

            if (step == 0) {
                if (this.size < 40 && this.castle_order == 0) {
                    var rush_path = this.onion_search(
                        [this.me.x, this.me.y], this.objective, 9,
                        this.get_two_onion_rings_around.bind(this));

                    if (rush_path.length < 8) {
                        this.mode = 1;
                        this.enqueue_unit(SPECS.CRUSADER, 0, null, this.objective);
                        this.enqueue_unit(SPECS.CRUSADER, 0, null, this.objective);
                        this.enqueue_unit(SPECS.CRUSADER, 0, null, this.objective);
                        this.enqueue_unit(SPECS.CRUSADER, 0,
                            this.encode_coordinates(this.objective), null);
                    }
                }

                else {
                    this.enqueue_unit(SPECS.PILGRIM, 0, null, null);
                    this.enqueue_unit(SPECS.PILGRIM, 1, null, null);
                }
            }

            // TODO: decide if resources are limited (compared to map size) and
            // look for safe resource patches
            // TODO: implement square safety function

            if (this.queue_unit.length == 0) {
                if (this.index_karbonite < this.ordered_karbonite.length) {
                    this.enqueue_unit(SPECS.PILGRIM, 0, null, null);
                }

                else if (this.index_fuel < this.ordered_fuel.length
                        && this.index_fuel < 4) {
                    this.enqueue_unit(SPECS.PILGRIM, 1, null, null);
                }

                // produce crusaders if rushing
                else if (this.mode == 1
                        && this.current_rusher == this.castle_order
                        && this.karbonite >= this.unit_karbonite_costs[3]
                        && this.fuel >= this.unit_fuel_costs[3]) {
                    this.enqueue_unit(SPECS.CRUSADER, 0,
                        this.encode_coordinates(this.objective), null);
                }

                else if (step > 10 && this.karbonite > 120
                        && this.fuel > 400) {
                    this.enqueue_unit(
                        SPECS.PROPHET, 0,
                        this.encode_coordinates(this.objective), null);
                }
            }

            if (this.queue_unit.length > 0) {
                var target_square = this.queue_spawn.shift();
                var target_unit = this.queue_unit.shift();
                var target_signal = this.queue_signal.shift();
                var target_destination = this.queue_destination.shift();

                target_square = this.get_optimal_buildable_square_for(
                    target_square, target_destination);

                if (target_square != null) {
                    // TODO: handle signal vetoes properly
                    if (target_signal != null && !signal_veto) {
                        this.signal(target_signal, this.distance(
                            [this.me.x, this.me.y], target_square));
                    }

                    this.log('  - build unit type [' + target_unit + '] at ('
                        + target_square[0] + ', ' + target_square[1] + ')');
                    return this.build_unit(target_unit,
                                           target_square[0] - this.me.x,
                                           target_square[1] - this.me.y);
                }
            }
        }

        else if (this.me.unit == SPECS.CHURCH) {
            this.log('Church [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            if (step == 0) {
                this.symmetry = this.guess_map_symmetry();

                // TODO: contingency for when no resources are found
                this.ordered_karbonite = this.order_resources(
                    this.filter_by_map_symmetry(this.get_local_resources(
                        this.karbonite_map)));
                this.ordered_fuel = this.order_resources(
                    this.filter_by_map_symmetry(this.get_local_resources(
                        this.fuel_map)));

                this.index_karbonite++;

                this.objective = this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]);
            }

            var visibles = this.get_visible_robots();
            var enemies = this.filter_visible_enemies(visibles);
            var attackables = this.filter_enemy_attackables(enemies);

            var church_safety = this.get_church_defence_status(
                visibles, enemies);

            if (church_safety == 0) {
                ;
            }

            else {
                this.queue_unit.length = 0;
                this.queue_spawn.length = 0;
                this.queue_signal.length = 0;

                var nearest_enemy = this.get_nearest_unit(enemies);
                var signal_value = this.encode_coordinates(this.objective);
                if (church_safety == 1) {
                    this.enqueue_unit(SPECS.PROPHET, 0, signal_value, null);
                }

                else {
                    this.enqueue_unit(SPECS.PREACHER, 0, signal_value,
                                      nearest_enemy);
                }
            }

            // TODO: defend with (stationary) prophets against enemies

            // signal veto to avoid multiple broadcasts overriding each other
            var signal_veto = false;

            // TODO: decide units/target resource based on distribution of
            // resources

            if (step == 0) {
                this.enqueue_unit(
                    SPECS.PROPHET, 0,
                    this.encode_coordinates(this.objective), null);
                this.enqueue_unit(SPECS.PILGRIM, 0, null, null);
                this.enqueue_unit(SPECS.PILGRIM, 1, null, null);
            }

            // TODO: decide if resources are limited (compared to map size) and
            // look for safe resource patches
            // TODO: implement square safety function

            if (this.queue_unit.length == 0) {
                if (this.index_karbonite < this.ordered_karbonite.length) {
                    this.enqueue_unit(SPECS.PILGRIM, 0, null, null);
                }

                else if (this.index_fuel < this.ordered_fuel.length
                        && this.index_fuel < 4) {
                    this.enqueue_unit(SPECS.PILGRIM, 1, null, null);
                }

                else if (step > 10 && this.karbonite > 100
                        && this.fuel > 200) {
                    this.enqueue_unit(
                        SPECS.PROPHET, 0,
                        this.encode_coordinates(this.objective), null);
                }
            }

            if (this.queue_unit.length > 0) {
                var target_square = this.queue_spawn.shift();
                var target_unit = this.queue_unit.shift();
                var target_signal = this.queue_signal.shift();
                var target_destination = this.queue_destination.shift();

                target_square = this.get_optimal_buildable_square_for(
                    target_square, target_destination);

                if (target_square != null) {
                    // TODO: handle signal vetoes properly
                    if (target_signal != null && !signal_veto) {
                        this.signal(target_signal, this.distance(
                            [this.me.x, this.me.y], target_square));
                    }

                    this.log('  - build unit type [' + target_unit + '] at ('
                        + target_square[0] + ', ' + target_square[1] + ')');
                    return this.build_unit(target_unit,
                                           target_square[0] - this.me.x,
                                           target_square[1] - this.me.y);
                }
            }
        }

        else if (this.me.unit == SPECS.PILGRIM) {
            this.log('Pilgrim [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            // save birthplace as nearest deposit time
            // listen to radio for directions from the castle/church
            if (step === 0) {
                this.fountain = this.get_adjacent_deposit_point();

                this.symmetry = this.guess_map_symmetry();
            }

            var visibles = this.get_visible_robots();

            var radioing = this.filter_radioing_robots(visibles);
            for (var i = 0; i < radioing.length; i++) {
                var robot = radioing[i];
                if (robot.unit < 2 && this.memory == null) {
                    this.target = this.decode_coordinates(robot.signal);
                    this.memory = this.target;
                    this.birthplace = [this.me.x, this.me.y];
                    break;
                }
            }

            // clear target destination after arrival
            if (this.target != null
                    && this.target[0] == this.me.x
                    && this.target[1] == this.me.y) {
                this.target = null;

                if (this.on_resource(this.karbonite_map)
                        && this.get_adjacent_deposit_point() == null
                        && this.distance([this.me.x, this.me.y],
                                         this.fountain) > 25) {
                    var church_square = this.get_optimal_buildable_square_for(
                        church_square, null);
                    this.fountain = church_square;
                    this.birthplace = [this.me.x, this.me.y];
                    this.target = null;
                    return this.build_unit(SPECS.CHURCH,
                                           church_square[0] - this.me.x,
                                           church_square[1] - this.me.y);
                }
            }

            // TODO: check for attacking units and check distance to deposit
            // point
            // TODO: check turns of attackers and friends to determine if
            // evasion is necessary, though may be complicated with unknown
            // targetting priorities of enemies

            var enemies = this.filter_attacking_enemies(
                this.filter_visible_enemies(visibles));

            var attacked_count = 0;
            for (var i = 0; i < enemies.length; i++) {
                var enemy = enemies[i];
                if (this.in_attack_range_of(enemy)) {
                    attacked_count++;
                }
            }

            if (attacked_count > 0) {
                // evade enemies by moving to edge of map
                // TODO: be careful not to be overly scared
                this.mode = 1;
            }

            else if (enemies.length > 0) {
                var enemies_by_units = this.filter_unit_types(enemies);
                if (enemies_by_units[SPECS.CRUSADER].length > 0) {
                    var nearest_crusader = this.get_nearest_unit(
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
                this.target = this.get_direction_to_edge();
            }

            // mine resources if safe and appropriate
            // TODO: safety check
            if (this.target == null) {
                if (this.on_resource(this.karbonite_map)
                        && this.me.karbonite < 19) {
                    this.log('  - mining karbonite');
                    return this.mine();
                }

                if (this.on_resource(this.fuel_map) && this.me.fuel < 91) {
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
                this.target = this.birthplace;
            }

            // attempt to target remembered resource after any interruption
            // (deposition, evasion, etc..)
            if (this.target == null && this.memory != null) {
                this.target = this.memory;
            }

            // handle cases where target is blocked by another unit
            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_for(this.target);

            this.log('  target: ' + this.target);

            // proceed to target
            if (this.path != null && this.path.length > 0) {
                var destination = this.take_step(this.path, this.me.unit);
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

            var visibles = this.get_visible_robots();

            var radioing = this.filter_all_radioing_robots(visibles);
            for (var i = 0; i < radioing.length; i++) {
                var robot = radioing[i];
                if (robot.unit == 0 && robot.x == this.fountain[0]
                        && robot.y == this.fountain[1]) {
                    if (this.target == null) {
                        this.target = this.decode_coordinates(robot.signal);
                        this.memory = this.target
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

            var enemies = this.filter_visible_enemies(visibles);

            // identify castle if it is within range
            if (this.memory != null && this.in_vision_range(this.memory)) {
                var castle_prescence = null;
                for (var i = 0; i < enemies.length; i++) {
                    if (enemies[i].unit == 0) {
                        castle_prescence = enemies[i];
                        break;
                    }
                }

                if (castle_prescence == null) {
                    var signal_value = this.encode_coordinates(
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
                if (this.in_attack_range(this.victim)) {
                    this.log('  - attack unit [' + this.victim.id
                        + '], type (' + this.victim.unit + ') at '
                        + (this.victim.x - this.me.x) + ', '
                        + (this.victim.y - this.me.y));
                    return this.attack(this.victim.x - this.me.x,
                                       this.victim.y - this.me.y);
                }
            }

            var attackables = this.filter_enemy_attackables(enemies);

            var prey = this.get_attack_target_from(attackables,
                                                   [0, 2, 4, 5, 3, 1]);

            if (prey != null) {
                this.log('  - attack unit [' + prey.id + '], type ('
                    + prey.unit + ') at ' + (prey.x - this.me.x) + ', '
                    + (prey.y - this.me.y));
                return this.attack(prey.x - this.me.x, prey.y - this.me.y);
            }

            // TODO: fuzzy target destinations to surround enemies properly
            // TODO: target random square within 4x4 block in (+, +) direction
            // to account for truncated coordinate information (communications
            // limitation)

            // TODO: wrap around defenders (if possible) to attack castle
            // TODO: consider using pilgrims for vision

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_for(this.target);

            this.log('  target: ' + this.target);

            // proceed to target destination
            if (this.path != null && this.path.length > 0) {
                var destination = this.take_step(this.path, this.me.unit);
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

            var visibles = this.get_visible_robots();

            var radioing = this.filter_all_radioing_robots(visibles);
            for (var i = 0; i < radioing.length; i++) {
                var robot = radioing[i];
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

            var visibles = this.get_visible_robots();
            var enemies = this.filter_visible_enemies(visibles);
            var attackables = this.filter_enemy_attackables(enemies);

            var prey = this.get_attack_target_from(attackables,
                                                   [4, 5, 2, 0, 3, 1]);
            if (prey != null) {
                this.log('  - attack unit [' + prey.id + '], type ('
                    + prey.unit + ') at ' + (prey.x - this.me.x) + ', '
                    + (prey.y - this.me.y));
                return this.attack(prey.x - this.me.x, prey.y - this.me.y);
            }

            this.target = null;

            if (this.is_adjacent(this.fountain) && this.mode != 1) {
                // move off buildable square
                this.target = this.memory;
            }

            // deposit resources if convenient
            if (this.target == null) {
                if (this.is_adjacent(this.fountain)
                        && (this.me.karbonite || this.me.fuel)) {
                    this.log('  - depositing resources [emergency]');
                    this.mode = 0;
                    return this.give(this.fountain[0] - this.me.x,
                                     this.fountain[1] - this.me.y,
                                     this.me.karbonite, this.me.fuel);
                }

                else if ((this.me.karbonite > 9 || this.me.fuel > 79)
                        && this.distance([this.me.x, this.me.y],
                                         this.fountain) <= 10) {
                    this.target = this.fountain;
                    this.mode = 1;
                }
            }

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_for(this.target);

            this.log('  target: ' + this.target);

            // proceed to target destination
            if (this.path != null && this.path.length > 0) {
                var destination = this.take_step(this.path, this.me.unit);
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

            var visibles = this.get_visible_robots();

            var radioing = this.filter_all_radioing_robots(visibles);
            for (var i = 0; i < radioing.length; i++) {
                var robot = radioing[i];
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

            var visibles = this.get_visible_robots();
            var enemies = this.filter_visible_enemies(visibles);
            var attackables = this.filter_enemy_attackables(enemies);

            var prey = this.get_attack_target_from(attackables,
                                                   [4, 5, 2, 0, 3, 1]);
            if (prey != null) {
                var splash_target = this.get_splash_for([prey.x, prey.y]);
                this.log('  - attack unit [' + prey.id + '], type ('
                    + prey.unit + ') at ' + splash_target[0] + ', '
                    + splash_target[1]);
                return this.attack(splash_target[0] - this.me.x,
                                   splash_target[1] - this.me.y);
            }

            this.target = null;

            if (this.is_adjacent(this.fountain)) {
                // move off buildable square
                this.target = this.memory;
            }

            // deposit resources if convenient
            if (this.target == null) {
                if (this.is_adjacent(this.fountain)
                        && (this.me.karbonite || this.me.fuel)) {
                    this.log('  - depositing resources [emergency]');
                    this.mode = 0;
                    return this.give(this.fountain[0] - this.me.x,
                                     this.fountain[1] - this.me.y,
                                     this.me.karbonite, this.me.fuel);
                }

                else if ((this.me.karbonite > 9 || this.me.fuel > 79)
                        && this.distance([this.me.x, this.me.y],
                                         this.fountain) <= 10) {
                    this.target = this.fountain;
                    this.mode = 1;
                }
            }

            this.target = this.get_final_target_for(this.target);
            this.path = this.get_path_for(this.target);

            this.log('  target: ' + this.target);

            // proceed to target destination
            if (this.path != null && this.path.length > 0) {
                var destination = this.take_step(this.path, this.me.unit);
                this.log('  - moving to destination: (' + destination[0] + ', '
                    + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }
    }

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

    is_passable(square) {
        var x = square[0];
        var y = square[1];

        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            return false;
        }

        return this.map[y][x];
    }

    is_passable_and_empty(square) {
        var x = square[0];
        var y = square[1];

        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            return false;
        }

        var nonempty = this.get_visible_robot_map();

        return this.map[y][x] && (nonempty[y][x] < 1);
    }

    is_buildable(square) {
        return this.is_passable_and_empty(square);
    }

    is_adjacent(square) {
        return (this.distance([this.me.x, this.me.y], square) < 3);
    }

    get_adjacent_deposit_point() {
        var visibles = this.get_visible_robots();
        for (var i = 0; i < visibles.length; i++) {
            if (visibles[i].unit < 2 && visibles[i].team == this.me.team) {
                if (this.is_adjacent([visibles[i].x, visibles[i].y])) {
                    return [visibles[i].x, visibles[i].y];
                }
            }
        }

        return null;
    }

    guess_map_symmetry() {
        var karbonite_map = this.karbonite_map;
        var karbonite_coords = this.get_resources(karbonite_map);

        for (var i = 0; i < karbonite_coords.length; i++) {
            var coord = karbonite_coords[i];
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
        if (this.symmetry == 0) {
            return [this.size - 1 - square[0], square[1]];
        }

        return [square[0], this.size - 1 - square[1]];
    }

    get_direction_to_edge() {
        if (this.symmetry == 0) {
            var side = (this.me.x > this.size / 2);
            if (side == true) {
                return [Math.min(this.size - 1, this.me.x + 4), this.me.y];
            }

            else {
                return [Math.max(0, this.me.x - 4), this.me.y];
            }
        }

        var side = (this.me.y > this.size / 2);
        if (side == true) {
            return [this.me.x, Math.min(this.size - 1, this.me.y + 4)];
        }

        else {
            return [this.me.x, Math.max(0, this.me.y - 4)];
        }
    }

    filter_by_map_symmetry(squares) {
        if (this.symmetry == null) {
            return [];
        }

        var square = [this.me.x, this.me.y];
        var side = (square[this.symmetry] > this.map.length / 2);

        var filtered = [];
        for (var i = 0; i < squares.length; i++) {
            if ((squares[i][this.symmetry] > this.map.length / 2) == side) {
                filtered.push(squares[i]);
            }
        }

        return filtered;
    }

    get_adjacent_squares() {
        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = this.me.x + this.compass[i][0];
            var adjy = this.me.y + this.compass[i][1];
            if (this.is_passable([adjx, adjy])) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_adjacent_passable_empty_squares() {
        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = this.me.x + this.compass[i][0];
            var adjy = this.me.y + this.compass[i][1];
            if (this.is_passable_and_empty([adjx, adjy])) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_adjacent_passable_squares_at(square) {
        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = square[0] + this.compass[i][0];
            var adjy = square[1] + this.compass[i][1];
            if (this.is_passable([adjx, adjy])) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_adjacent_passable_empty_squares_at(square) {
        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = square[0] + this.compass[i][0];
            var adjy = square[1] + this.compass[i][1];
            if (this.is_passable_and_empty([adjx, adjy])) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_buildable_squares() {
        return this.get_adjacent_passable_empty_squares();
    }

    get_buildable_squares_at(square) {
        return this.get_adjacent_passable_empty_squares_at(square);
    }

    get_optimal_buildable_square_for(target, destination) {
        if (destination != null) {
            var adjacent = this.get_buildable_squares();
            if (adjacent.length == 0) {
                return null;
            }

            var min_index = 0;
            var min_distance = 100;
            for (var i = 0; i < adjacent.length; i++) {
                var square = adjacent[i];
                var distance = this.distance(square, [this.me.x, this.me.y]);
                if (distance < min_distance) {
                    min_index = i;
                    min_distance = distance;
                }
            }

            return adjacent[min_index];
        }

        if (target != null && !this.is_buildable(target)) {
            var adjacent = this.get_buildable_squares_at(target);
            for (var i = 0; i < adjacent.length; i++) {
                if (this.is_adjacent(adjacent[i])) {
                    return adjacent[i];
                }
            }
        }

        if (target == null) {
            var buildable = this.get_buildable_squares();
            if (buildable.length > 0) {
                return buildable[0];
            }
        }

        return target;
    }

    metric(r, s) {
        return Math.max(Math.abs(r[0] - s[0]), Math.abs(r[1] - s[1]));
    }

    distance(r, s) {
        return (r[0] - s[0]) * (r[0] - s[0]) + (r[1] - s[1]) * (r[1] - s[1]);
    }

    smear_centred(square) {
        var x = square[0];
        var y = square[1];

        var reachables = [];
        for (var i = 0; i < 8; i++) {
            var adjx = square[0] + this.compass[i][0];
            var adjy = square[1] + this.compass[i][1];
            if (this.is_passable_and_empty([adjx, adjy])) {
                reachables.push([adjx, adjy]);
            }
        }

        if (reachables.length == 0) {
            const ring_two = [
                [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
                [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1],
                [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2]];
            for (var i = 0; i < 16; i++) {
                var rngx = square[0] + ring_two[i][0];
                var rngy = square[1] + ring_two[i][1];
                if (this.is_passable_and_empty([rngx, rngy])) {
                    reachables.push([rngx, rngy]);
                }
            }
        }

        if (reachables.length > 0) {
            return reachables[Math.floor(Math.random() * reachables.length)];
        }

        return null;
    }

    on_resource(resource_map) {
        return resource_map[this.me.y][this.me.x];
    }

    get_resources(resource_map) {
        var resources = [];
        for (var i = 0; i < this.size; i++) {
            for (var j = 0; j < this.size; j++) {
                if (resource_map[i][j]) {
                    resources.push([j, i]);
                }
            }
        }

        return resources;
    }

    get_local_resources(resource_map) {
        var local_resources = [];

        var resources = this.get_resources(resource_map);
        for (var i = 0; i < resources.length; i++) {
            if (this.distance([this.me.x, this.me.y], resources[i]) < 25) {
                local_resources.push(resources[i]);
            }
        }

        return local_resources;
    }

    enqueue_unit(unit, options, signal, destination) {
        this.queue_unit.push(unit);

        if (unit == SPECS.PILGRIM) {
            if (options == 0) {
                if (this.index_karbonite < this.ordered_karbonite.length) {
                    this.queue_spawn.push(
                        this.ordered_karbonite[this.index_karbonite][1]);
                    this.queue_signal.push(this.encode_coordinates(
                        this.ordered_karbonite[this.index_karbonite][0]));
                    this.queue_destination.push(
                        this.ordered_karbonite[this.index_karbonite][0]);
                    this.index_karbonite++;
                }
            }

            else if (options == 1) {
                if (this.index_fuel < this.ordered_fuel.length) {
                    this.queue_spawn.push(
                        this.ordered_fuel[this.index_fuel][1]);
                    this.queue_signal.push(this.encode_coordinates(
                        this.ordered_fuel[this.index_fuel][0]));
                    this.queue_destination.push(
                        this.ordered_fuel[this.index_fuel][0]);
                    this.index_fuel++;
                }
            }

            else {
                this.queue_spawn.push(null);
                this.queue_signal.push(signal);
                this.queue_destination.push(destination);
            }
        }

        else {
            this.queue_spawn.push(null);
            this.queue_signal.push(signal);
            this.queue_destination.push(destination);
        }
    }

    astar(start, end, adjacency) {
        var trace = {};

        var G = {};
        var open_squares = {};

        G[start] = 0;
        open_squares[start] = this.distance(start, end);

        var closed_squares = {};

        while (Object.keys(open_squares).length > 0) {
            var head = null;
            var score = 0;

            for (var square in open_squares) {
                var square_score = open_squares[square];
                if (head == null || square_score < score) {
                    head = JSON.parse('[' + square + ']');
                    score = square_score;
                }
            }

            if (head[0] == end[0] && head[1] == end[1]) {
                var path = [head];
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

            var adjacent = adjacency(head);
            for (var i = 0; i < adjacent.length; i++) {
                var square = adjacent[i];

                if (closed_squares[square] == 0) {
                    continue;
                }

                var total = G[head] + this.distance(head, square);

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

        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var rngx = square[0] + ring_two[i][0];
            var rngy = square[1] + ring_two[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        for (var i = 0; i < 4; i++) {
            var rngx = square[0] + ring_one[i][0];
            var rngy = square[1] + ring_one[i][1];
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

        var adjacent = [];
        for (var i = 0; i < 16; i++) {
            var rngx = square[0] + ring_three[i][0];
            var rngy = square[1] + ring_three[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        for (var i = 0; i < 8; i++) {
            var rngx = square[0] + ring_two[i][0];
            var rngy = square[1] + ring_two[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        for (var i = 0; i < 4; i++) {
            var rngx = square[0] + ring_one[i][0];
            var rngy = square[1] + ring_one[i][1];
            if (this.is_passable_and_empty([rngx, rngy])) {
                adjacent.push([rngx, rngy]);
            }
        }

        return adjacent;
    }

    onion_search(start, end, range, layering) {
        var trace = {};

        var G = {};
        var open_squares = {};

        G[start] = 0;
        open_squares[start] = this.distance(start, end);

        var closed_squares = {};

        while (Object.keys(open_squares).length > 0) {
            var head = null;
            var score = 0;

            for (var square in open_squares) {
                var square_score = open_squares[square];
                if (head == null || square_score < score) {
                    head = JSON.parse('[' + square + ']');
                    score = square_score;
                }
            }

            if (this.distance(head, end) <= range) {
                var path = [end, head];
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

            var adjacent = layering(head);
            for (var i = 0; i < adjacent.length; i++) {
                var square = adjacent[i];

                if (closed_squares[square] == 0) {
                    continue;
                }

                var total = G[head] + this.distance(head, square);

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

    take_step(path, speed) {
        const movement_speed = [0, 0, 4, 9, 4, 4];
        const range = movement_speed[this.me.unit];

        var next = null;
        for (var i = 1; i < path.length; i++) {
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

    get_final_target_for(target) {
        if (target != null) {
            if (!this.is_passable_and_empty(target)) {
                if (this.me.unit == SPECS.PILGRIM
                        && target[0] == this.birthplace[0]
                        && target[1] == this.birthplace[1]) {
                    target = this.smear_centred(this.fountain);
                }

                else {
                    target = this.smear_centred(target);
                }
            }
        }

        return target;
    }

    get_path_for(target) {
        if (target != null) {
            if (this.me.unit == SPECS.CRUSADER) {
                return this.onion_search(
                    [this.me.x, this.me.y], target, 9,
                    this.get_three_onion_rings_around.bind(this));
            }

            // return this.astar([this.me.x, this.me.y], target,
            //     this.get_adjacent_passable_empty_squares_at.bind(this));
            return this.onion_search(
                [this.me.x, this.me.y], target, 4,
                this.get_two_onion_rings_around.bind(this));
        }

        return null;
    }

    order_resources(resources) {
        var resource_paths = [];
        for (var i = 0; i < resources.length; i++) {
            resource_paths[i] = (this.astar(
                [this.me.x, this.me.y], resources[i],
                this.get_adjacent_passable_squares_at.bind(this)));
        }

        resource_paths.sort(function(r, s) {
            return r.length - s.length; });

        var ordered_resources = [];
        for (var i = 0; i < resource_paths.length; i++) {
            var path = resource_paths[i];
            ordered_resources.push(
                [path[path.length - 1], path[0], path.length]);
        }

        return ordered_resources;
    }

    encode_coordinates(square) {
        return (square[0] | square[1] << 6);
    }

    decode_coordinates(signal) {
        return [signal & 0x003f, (signal & 0x0fc0) >> 6];
    }

    filter_castling_robots(visibles) {
        var castling = [];
        for (var i = 0; i < visibles.length; i++) {
            var robot = visibles[i];
            if (robot.team == this.me.team && robot.castle_talk != 0) {
                castling.push(robot);
            }
        }

        return castling;
    }

    filter_radioing_robots(visibles) {
        var radioing = [];
        for (var i = 0; i < visibles.length; i++) {
            var robot = visibles[i];
            if (this.is_radioing(robot) && robot.team == this.me.team
                    && robot.id != this.me.id) {
                radioing.push(robot);
            }
        }

        return radioing;
    }

    filter_all_radioing_robots(visibles) {
        var radioing = [];
        for (var i = 0; i < visibles.length; i++) {
            var robot = visibles[i];
            if (this.is_radioing(robot)) {
                radioing.push(robot);
            }
        }

        return radioing;
    }

    filter_visible_enemies(visibles) {
        var enemies = [];
        for (var i = 0; i < visibles.length; i++) {
            var robot = visibles[i];
            if (this.is_visible(robot) && robot.team != this.me.team) {
                enemies.push(robot);
            }
        }

        return enemies;
    }

    filter_visible_enemies_in_attack_range(visibles) {
        var enemies = [];
        for (var i = 0; i < visibles.length; i++) {
            var robot = visibles[i];
            if (this.is_visible(robot) && robot.team != this.me.team
                    && this.in_attack_range(robot)) {
                enemies.push(robot);
            }
        }

        return enemies;
    }

    filter_enemy_attackables(enemies) {
        var attackables = [];
        for (var i = 0; i < enemies.length; i++) {
            var enemy = enemies[i];
            if (this.in_attack_range(enemy)) {
                attackables.push(enemy);
            }
        }

        return attackables;
    }

    filter_attacking_enemies(enemies) {
        var attacking = [];
        for (var i = 0; i < enemies.length; i++) {
            var enemy = enemies[i];
            if (enemy.unit > 2) {
                attacking.push(enemy);
            }
        }

        return attacking;
    }

    filter_visible_friends(visibles) {
        var friends = [];
        for (var i = 0; i < visibles.length; i++) {
            var robot = visibles[i];
            if (robot.team == this.me.team
                    && this.distance([robot.x, robot.y],
                                     [this.me.x, this.me.y]) <= 9) {
                friends.push(robot);
            }
        }

        return friends;
    }

    is_alive(robot) {
        return this.get_robot(robot.id) != null;
    }

    in_attack_range(robot) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 16];

        var range = this.distance([this.me.x, this.me.y], [robot.x, robot.y]);
        return ((range <= max_attack_range[this.me.unit])
            && (range >= min_attack_range[this.me.unit]));
    }

    in_attack_range_of(robot) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 26];

        var range = this.distance([this.me.x, this.me.y], [robot.x, robot.y]);
        return ((range <= max_attack_range[robot.unit])
            && (range >= min_attack_range[robot.unit]));
    }

    in_vision_range(square) {
        const vision_range = [100, 100, 100, 49, 64, 16];

        return (this.distance([this.me.x, this.me.y], square)
            <= vision_range[this.me.unit]);
    }

    filter_unit_types(robots) {
        var types = [[], [], [], [], [], []];
        for (var i = 0; i < robots.length; i++) {
            var robot = robots[i];
            types[robot.unit].push(robot);
        }

        return types;
    }

    get_castle_defence_status(visibles, enemies) {
        if (enemies.length == 0) {
            return 0;
        }

        var friendlies = this.filter_visible_friends(visibles);
        var enemies_by_units = this.filter_unit_types(enemies);
        var friendlies_by_units = this.filter_unit_types(friendlies);

        if (enemies_by_units[4].length > friendlies_by_units[4].length) {
            return 1;
        }

        if (enemies_by_units[3].length > friendlies_by_units[5].length + 1) {
            return 2;
        }

        if (enemies_by_units[5].length > friendlies_by_units[4].length) {
            var nearest = this.get_nearest_unit(enemies_by_units[5]);

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

    get_church_defence_status(visibles, enemies) {
        if (enemies.length == 0) {
            return 0;
        }

        var friendlies = this.filter_visible_friends(visibles);
        var enemies_by_units = this.filter_unit_types(enemies);
        var friendlies_by_units = this.filter_unit_types(friendlies);

        if (enemies_by_units[4].length > friendlies_by_units[4].length) {
            return 1;
        }

        if (enemies_by_units[3].length > friendlies_by_units[5].length) {
            return 2;
        }

        if (enemies_by_units[5].length > friendlies_by_units[4].length) {
            var nearest = this.get_nearest_unit(enemies_by_units[5]);

            if (this.distance([this.me.x, this.me.y],
                              [nearest.x, nearest.y]) <= 25) {
                return 2;
            }

            else {
                return 1;
            }
        }

        // not necessary to build new units, try attacking
        return 1;
    }

    get_nearest_unit(units) {
        var min_index = 0;
        var min_distance = 100;
        for (var i = 0; i < units.length; i++) {
            var robot = units[i];
            var distance_to_unit = this.distance([this.me.x, this.me.y],
                                                 [robot.x, robot.y]);
            if (distance_to_unit < min_distance) {
                min_index = i;
                min_distance = distance_to_unit;
            }
        }

        return units[min_index];
    }

    get_attack_target_from(attackables, priority) {
        if (attackables.length == 0) {
            return null;
        }

        var attackables_by_units = this.filter_unit_types(attackables);
        for (var i = 0; i < priority.length; i++) {
            var order = priority[i];
            if (attackables_by_units[order].length > 0) {
                return this.get_nearest_unit(attackables_by_units[order]);
            }
        }
    }

    get_unit_count_for(square, robot_map) {
        var robot_id = robot_map[square[1]][square[0]];
        if (robot_id < 1) {
            return 0;
        }

        var robot = this.get_robot(robot_id);
        if (robot.team == this.me.team) {
            return -1;
        }

        return 1;
    }

    get_unit_count_difference_around(square) {
        var robot_map = this.get_visible_robot_map();

        var count = 0;
        count += this.get_unit_count_for(square, robot_map);
        var adjacent = this.get_adjacent_passable_squares_at(square);
        for (var i = 0; i < adjacent.length; i++) {
            count += this.get_unit_count_for(adjacent[i], robot_map);
        }

        return count;
    }

    get_splash_for(target) {
        var square = target;
        var max_count = this.get_unit_count_difference_around(target);

        var adjacent = this.get_adjacent_passable_squares_at(target);
        for (var i = 0; i < adjacent.length; i++) {
            var count = this.get_unit_count_difference_around(adjacent[i]);
            if (count > max_count) {
                square = adjacent[i];
            }
        }

        return square;
    }

    filter_by_nearest_distance(squares, targets) {
        // targets: castles, squares: resources
        var filtered = [];
        for (var i = 0; i < squares.length; i++) {
            var square = squares[i];
            var nearest = this.get_nearest_distance(targets, square);
            if (nearest >= 25) {
                filtered.push(square);
            }
        }

        return filtered;
    }

    get_nearest_distance(squares, target) {
        if (squares.length == 0) {
            return null;
        }

        var min_distance = 8192;
        for (var i = 0; i < squares.length; i++) {
            var square = squares[i];
            var distance = this.distance(target, square);
            if (distance < min_distance) {
                min_distance = distance;
            }
        }

        return min_distance;
    }

    count_impassable_squares_around(square) {
        var count = 0;

        var x = square[0];
        var y = square[1];
        for (var i = -4; i < 5; i++) {
            for (var j = -4; j < 5; j++) {
                if (!this.is_passable([y + j, x + i])) {
                    count++;
                }
            }
        }

        return count;
    }

    get_safety_evaluation(resources, friends, enemies) {
        var safety = [];
        for (var i = 0; i < resources.length; i++) {
            var resource = resources[i];
            safety[i] = this.get_nearest_distance(enemies, resource)
                - this.get_nearest_distance(friends, resource)
                + this.count_impassable_squares_around(resource);
        }

        return safety;
    }

    get_index_of_largest_in(list) {
        var max = -16384;
        var max_index = 0;
        for (var i = 0; i < list.length; i++) {
            if (list[i] > max) {
                max = list[i];
                max_index = i;
            }
        }

        return max_index;
    }

    get_church_candidate(resources, castles) {
        var enemy_castles = [];
        for (var i = 0; i < castles.length; i++) {
            var castle = castles[i];
            enemy_castles.push(this.reflect_about_symmetry_axis(castle));
        }

        var safety = this.get_safety_evaluation(resources, castles,
                                                enemy_castles);
        var safest = resources[this.get_index_of_largest_in(safety)];

        return safest;
    }
}
