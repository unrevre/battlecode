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

        this.castles = 1;
        this.castle_id = [];
        this.castle_x = [];
        this.castle_y = [];

        this.objectives = [];
        this.objective = null;

        this.ordered_karbonite = [];
        this.ordered_fuel = [];

        this.index_karbonite = 0;
        this.index_fuel = 0;

        this.queue_unit = [];
        this.queue_spawn = [];
        this.queue_signal = [];

        this.fountain = null;
        this.birthplace = null;
        this.birthmark = null;

        this.target = null;
        this.path = null;
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

                this.castle_id.push(this.me.id);
                this.objectives.push(this.reflect_about_symmetry_axis(
                    [this.me.x, this.me.y]));
                this.objective = this.objectives[0];
            }

            var visibles = this.get_visible_robots();

            // TODO: castle defensive actions
            var enemies = this.filter_visible_enemies(visibles);

            var attackables = this.filter_enemy_attackables(enemies);
            for (var i = 0; i < attackables.length; i++) {
                var attackable = attackables[i];
                if (attackable.unit == SPECS.PROPHET) {
                    return this.attack(attackable.x - this.me.x,
                                       attackable.y - this.me.y);
                }
            }

            // TODO: defend with (stationary) prophets against enemies

            // signal veto to avoid multiple broadcasts overriding each other
            var signal_veto = false;

            // check castle talk - abuse all information available
            var castling = this.filter_castling_robots(visibles);
            for (var i = 0; i < castling.length; i++) {
                var robot = castling[i];
                if (robot.unit < 2 && robot.id != this.me.id) {
                    if (step == 1) {
                        this.castles++;
                        this.castle_id.push(robot.id);
                        this.castle_x.push(robot.castle_talk);
                    }

                    else if (step == 2) {
                        this.castle_y.push(robot.castle_talk);
                    }
                }
            }

            if (step == 2) {
                for (var i = 0; i < this.castles - 1; i++) {
                    var coords = [this.castle_x.shift(), this.castle_y.shift()];
                    this.objectives.push(
                        this.reflect_about_symmetry_axis(coords));
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
                            && this.castle_x.length > 0
                            && this.castle_y.length > 0) {
                        this.objectives.shift();
                        this.objective = this.objectives[0];
                        this.signal(this.encode_coordinates(this.objective),
                                    this.distance([this.me.x, this.me.y],
                                                  [robot.x, robot.y]));
                        signal_veto = true;
                    }
                }
            }

            // clear castle talk by default
            this.castle_talk(0x00);

            // broadcast coordinates (highest 4 bits)
            if (step == 0) {
                this.castle_talk(this.me.x);
            }

            else if (step == 1) {
                this.castle_talk(this.me.y);
            }

            // TODO: decide units/target resource based on distribution of
            // resources

            if (step == 0) {
                this.enqueue_unit(SPECS.PILGRIM, 0, null);
                this.enqueue_unit(SPECS.PILGRIM, 1, null);
                this.enqueue_unit(SPECS.CRUSADER, 0,
                    this.encode_coordinates(this.objective));
                this.enqueue_unit(SPECS.CRUSADER, 0,
                    this.encode_coordinates(this.objective));
            }

            // TODO: decide if resources are limited (compared to map size) and
            // look for safe resource patches
            // TODO: implement square safety function

            if (this.queue_unit.length == 0) {
                if (this.index_karbonite < this.ordered_karbonite.length) {
                    this.enqueue_unit(SPECS.PILGRIM, 0, null);
                }

                else if (this.index_fuel < this.ordered_fuel.length
                        && this.index_fuel < 4) {
                    this.enqueue_unit(SPECS.PILGRIM, 1, null);
                }

                // produce crusaders by default
                else if (this.karbonite >= this.unit_karbonite_costs[3]
                        && this.fuel >= this.unit_fuel_costs[3]) {
                    this.enqueue_unit(SPECS.CRUSADER, 0,
                        this.encode_coordinates(this.objective));
                }
            }

            if (this.queue_unit.length > 0) {
                var target_square = this.queue_spawn.shift();
                var target_unit = this.queue_unit.shift();
                var target_signal = this.queue_signal.shift();

                if (target_square != null
                        && !this.is_buildable(target_square)) {
                    var target_adjacent =
                        this.get_buildable_squares_at(target_square);
                    for (var i = 0; i < target_adjacent.length; i++) {
                        if (this.is_adjacent(target_adjacent[i])) {
                            target_square = target_adjacent[i];
                            break;
                        }
                    }
                }

                if (target_square == null) {
                    var buildable = this.get_buildable_squares();
                    if (buildable.length > 0) {
                        target_square = buildable[0];
                    }
                }

                if (target_square != null) {
                    // TODO: handle signal vetoes properly
                    if (target_signal != null && !signal_veto) {
                        this.signal(target_signal, this.distance(
                            [this.me.x, this.me.y], target_square));
                    }

                    return this.build_unit(target_unit,
                                           target_square[0] - this.me.x,
                                           target_square[1] - this.me.y);
                }
            }
        }

        else if (this.me.unit == SPECS.CHURCH) {
            this.log('Church [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');
        }

        else if (this.me.unit == SPECS.PILGRIM) {
            this.log('Pilgrim [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            // save birthplace as nearest deposit time
            // listen to radio for directions from the castle/church
            if (step === 0) {
                this.fountain = this.get_adjacent_deposit_point();
            }

            var visibles = this.get_visible_robots();

            var radioing = this.filter_radioing_robots(visibles);
            for (var i = 0; i < radioing.length; i++) {
                var robot = radioing[i];
                if (robot.unit < 2 && this.birthmark == null) {
                    this.target = this.decode_coordinates(robot.signal);
                    this.birthmark = this.target;
                    this.birthplace = [this.me.x, this.me.y];
                    break;
                }
            }

            // clear target destination after arrival
            if (this.target != null
                    && this.target[0] == this.me.x
                    && this.target[1] == this.me.y) {
                this.target = null;
            }

            // TODO: check for attacking units and check distance to deposit
            // point
            // TODO: evade attackers if possible - be careful here not to be
            // overly scared

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
            if (this.me.karbonite > 18 || this.me.fuel > 90) {
                this.target = this.birthplace;
            }

            // attempt to target remembered resource after any interruption
            // (deposition, evasion, etc..)
            if (this.target == null && this.birthmark != null) {
                this.target = this.birthmark;
            }

            this.log('  target: ' + this.target);

            // handle cases where target is blocked by another unit
            if (!this.is_passable_and_empty(this.target)) {
                if (this.target[0] == this.fountain[0]
                        && this.target[1] == this.fountain[1]) {
                    this.target = this.smear_centred(this.fountain);
                }

                else {
                    this.target = this.smear_centred(this.target);
                }
            }

            if (this.target != null) {
                // TODO: replace with onion search for long distances
                this.path = this.astar([this.me.x, this.me.y], this.target,
                    this.get_adjacent_passable_empty_squares_at.bind(this));
            }

            else {
                this.path = null;
            }

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
                        break;
                    }
                }
            }

            // identify objective if possible
            var enemies = this.filter_visible_enemies(visibles);
            if (this.target != null && this.birthmark == null) {
                // identify enemy castle
                for (var i = 0; i < enemies.length; i++) {
                    if (enemies[i].unit == 0) {
                        this.birthmark = enemies[i];
                        this.target = [this.birthmark.x, this.birthmark.y];
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

            // TODO: check turn priorities to determine target, instead of
            // blindly attacking castle
            if (this.birthmark != null) {
                if (!this.is_visible_and_alive(this.birthmark)) {
                    // request another target if enemy castle is destroyed
                    // TODO: replace by castle talk, requiring some form of
                    // castle ordering
                    this.signal(
                        this.encode_coordinates(
                            [this.birthmark.x, this.birthmark.y]) + 0xd000,
                            this.distance([this.me.x, this.me.y],
                                          this.fountain));
                    this.birthmark == null;
                    this.target = null;
                }

                else if (this.in_attack_range(this.birthmark)) {
                    this.log('  - attack unit [' + this.birthmark.id
                        + '], type (' + this.birthmark.unit + ') at '
                        + (this.birthmark.x - this.me.x) + ', '
                        + this.birthmark.y - this.me.y);
                    return this.attack(this.birthmark.x - this.me.x,
                                       this.birthmark.y - this.me.y);
                }
            }

            // basic attacks
            // TODO: prioritise targets, instead of attacking first target
            // TODO: decide target to attack, somehow..
            var attackables = this.filter_enemy_attackables(enemies);
            if (attackables.length > 0) {
                var attackable = attackables[0];
                this.log('  - attack unit [' + attackable.id + '], type ('
                    + attackable.unit + ') at ' + attackable.x - this.me.x
                    + ', ' + attackable.y - this.me.y);
                return this.attack(attackable.x - this.me.x,
                                   attackable.y - this.me.y);
            }

            // TODO: fuzzy target destinations to surround enemies properly
            // TODO: target random square within 4x4 block in (+, +) direction
            // to account for truncated coordinate information (communications
            // limitation)

            // TODO: wrap around defenders (if possible) to attack castle
            // TODO: consider using pilgrims for vision

            this.log('  target: ' + this.target);

            if (this.target != null) {
                if (!this.is_passable_and_empty(this.target)) {
                    this.target = this.smear_centred(this.target);
                }

                this.path = this.onion_search([this.me.x, this.me.y],
                                              this.target, 9);
            }

            else {
                this.path = null;
            }

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

            // TODO: prophets generally should seek out choke points or cover
            // behind friend units and remain stationary
        }

        else if (this.me.unit == SPECS.PREACHER) {
            this.log('Preacher [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            // TODO: special aoe targetting for preachers
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
        var ret = Math.abs(this.me.x - square[0]) < 2
            && Math.abs(this.me.y - square[1]) < 2;
        return ret;
    }

    get_adjacent_deposit_point() {
        var visibles = this.get_visible_robots();
        for (var i = 0; i < visibles.length; i++) {
            if (visibles[i].unit < 2) {
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
            return [this.size - 1 - this.me.x, this.me.y];
        }

        return [this.me.x, this.size - 1 - this.me.y];
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

        return reachables[Math.floor(Math.random() * reachables.length)];
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

    enqueue_unit(unit, options, signal) {
        this.queue_unit.push(unit);

        if (unit == SPECS.PILGRIM) {
            if (options == 0) {
                if (this.index_karbonite < this.ordered_karbonite.length) {
                    this.queue_spawn.push(
                        this.ordered_karbonite[this.index_karbonite][1]);
                    this.queue_signal.push(this.encode_coordinates(
                        this.ordered_karbonite[this.index_karbonite][0]));
                    this.index_karbonite++;
                }
            }

            else {
                if (this.index_fuel < this.ordered_fuel.length) {
                    this.queue_spawn.push(
                        this.ordered_fuel[this.index_fuel][1]);
                    this.queue_signal.push(this.encode_coordinates(
                        this.ordered_fuel[this.index_fuel][0]));
                    this.index_fuel++;
                }
            }
        }

        else {
            this.queue_spawn.push(null);
            this.queue_signal.push(signal);
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

    get_onion_rings_around(square) {
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

    onion_search(start, end, range) {
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

            var adjacent = this.get_onion_rings_around(head);
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

    pixelate(path) {
        var points = [];
        for (var i = 1; i < path.length; i++) {
            var diff = [path[i][0] - path[i - 1][0],
                        path[i][1] - path[i - 1][1]];
            var steps = Math.max(Math.abs(diff[0]), Math.abs(diff[1]));
            var direction = [diff[0] / steps, diff[1] / steps];
            for (var j = 0; j < steps; j++) {
                points.push([path[i - 1][0] + j * direction[0],
                             path[i - 1][1] + j * direction[1]]);
            }
        }

        points.push(path[path.length - 1]);

        return points;
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

    is_visible_and_alive(robot) {
        return this.get_robot(robot.id) != null;
    }

    in_attack_range(robot) {
        const min_attack_range = [1, 0, 0, 1, 16, 1];
        const max_attack_range = [64, 0, 0, 16, 64, 16];

        var range = this.distance([this.me.x, this.me.y], [robot.x, robot.y]);
        return ((range <= max_attack_range[this.me.unit])
            && (range >= min_attack_range[this.me.unit]));
    }
}
