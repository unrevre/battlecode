import {BCAbstractRobot, SPECS} from 'battlecode';

let step = -1;

class MyRobot extends BCAbstractRobot {
    constructor() {
        super();

        this.compass = [
            [0, -1], [1, 0], [-1, 0], [0, 1],
            [-1, 1], [-1, -1], [1, -1], [1, 1]
        ];

        this.unit_karbonite_costs = [0, 50, 10, 20, 25, 30];
        this.unit_fuel_costs = [0, 200, 50, 50, 50, 50];

        this.size = null;
        this.symmetry = null;

        this.castles = 0;
        this.pilgrims = 0;

        this.ordered_karbonite = [];
        this.ordered_fuel = [];

        this.nearest_deposit = null;
        this.birthplace = null;
        this.birthmark = null;

        this.friends = [];
        this.enemies = [];

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

            // TODO: listen for castle talk from other castles/churches for
            // accounting of pilgrims - avoid overbuilding
            // TODO: listen for crusaders asking for another target
            var visibles = this.get_visible_robots();
            for (var i = 0; i < visibles.length; i++) {
                var robot = visibles[i];
                if (robot.unit < 2) {
                    this.log('  unit [' + robot.id + '], message: '
                        + robot.castle_talk);

                    var castle_talk = robot.castle_talk;
                    if (castle_talk != 0x00) {
                        if (step == 1) {
                            this.castles++;
                            this.friends.push([
                                (castle_talk & 0x0f) << 2, castle_talk >> 2]);
                        }
                    }
                }

                else if (robot.unit == 2) {
                    if (robot.castle_talk == 0x01) {
                        this.pilgrims++;
                    }
                }
            }

            // TODO: restrict ordering to nearby resources - minimise time
            // required for pathing
            if (step == 0) {
                this.symmetry = this.guess_map_symmetry();

                // TODO: contingency for when no resources are found
                this.ordered_karbonite = this.order_resources(
                    this.filter_by_map_symmetry(this.get_local_resources(
                        this.karbonite_map)));
                this.ordered_fuel = this.order_resources(
                    this.filter_by_map_symmetry(this.get_local_resources(
                        this.fuel_map)));
            }

            else if (step == 1) {
                for (var i = 0; i < this.friends.length; i++) {
                    var coord = this.friends[i];
                    if (this.symmetry == 0) {
                        this.enemies[i] = [this.size - 1 - coord[0], coord[1]];
                    }

                    else if (this.symmetry == 1) {
                        this.enemies[i] = [coord[0], this.size - 1 - coord[1]];
                    }
                }
            }

            // clear castle talk by default
            this.castle_talk(0x00);

            // broadcast coordinates (highest 4 bits)
            if (step == 0) {
                this.castle_talk((this.me.x >> 2) | (this.me.y >> 2) << 4);
            }

            // build on closest buildable square to target
            var target_square = null;
            var target_unit = null;

            // signal target location to built unit
            var signal_value = null;

            // TODO: decide units/target resource based on distribution of
            // resources
            // TODO: defend with (stationary) prophets against enemies
            if (step == 0) {
                if (this.ordered_karbonite.length > 0) {
                    target_unit = SPECS.PILGRIM;
                    target_square = this.ordered_karbonite[0][1];
                    signal_value = this.encode_coordinates(
                        this.ordered_karbonite[0][0]);
                }
            }

            else if (step == 1) {
                if (this.ordered_fuel.length > 0) {
                    target_unit = SPECS.PILGRIM;
                    target_square = this.ordered_fuel[0][1];
                    signal_value = this.encode_coordinates(
                        this.ordered_fuel[0][0]);
                }
            }

            else {
                if (this.karbonite >= this.unit_karbonite_costs[3]
                        && this.fuel >= this.unit_fuel_costs[3]) {
                    target_unit = SPECS.CRUSADER;
                    // TODO: compress more castle locations in signal value
                    if (this.enemies.length > 0) {
                        signal_value = this.encode_coordinates(this.enemies[0]);
                    }
                }
            }

            if (target_unit != null) {
                if (target_square != null
                        && !this.is_buildable(target_square)) {
                    var target_adjacent =
                        this.get_adjacent_passable_empty_squares_at(
                            target_square);
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
                    if (signal_value != null) {
                        this.signal(signal_value, this.distance(
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
                this.nearest_deposit = this.get_adjacent_deposit_point();

                var visibles = this.get_visible_robots();
                for (var i = 0; i < visibles.length; i++) {
                    if (visibles[i].team == this.me.team
                            && visibles[i].unit < 2
                            && this.is_radioing(visibles[i])) {
                        this.target = this.decode_coordinates(
                            visibles[i].signal);
                        this.birthmark = this.target;
                        this.birthplace = [this.me.x, this.me.y];
                        break;
                    }
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

            if (this.is_adjacent(this.nearest_deposit)
                    && (this.me.karbonite || this.me.fuel)) {
                this.target = null;
                this.log('  - depositing resources');
                return this.give(this.nearest_deposit[0] - this.me.x,
                                 this.nearest_deposit[1] - this.me.y,
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

            // TODO: check global resources and determine target resource

            this.log('  target: ' + this.target);

            if (this.target != null) {
                this.path = this.jump_point_search([this.me.x, this.me.y],
                                                   this.target);
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
                var visibles = this.get_visible_robots();
                for (var i = 0; i < visibles.length; i++) {
                    if (visibles[i].team == this.me.team
                            && visibles[i].unit < 2
                            && this.is_radioing(visibles[i])) {
                        this.target = this.decode_coordinates(
                            visibles[i].signal);
                        this.birthmark = this.target;
                        break;
                    }
                }
            }

            var enemies = this.get_visible_enemies();

            // close to target
            if (this.target != null
                    && this.metric([this.me.x, this.me.y], this.target) < 3) {
                // identify enemy castle
                var objective = null;
                for (var i = 0; i < enemies.length; i++) {
                    if (enemies[i].unit == 0) {
                        objective = enemies[i];
                        // TODO: check turn priorities to determine target,
                        // instead of blindly attacking castle
                        if (this.in_attack_range(
                                [objective.x, objective.y])) {
                            this.log('  - attack unit [' + objective.id
                                + '], type (' + objective.unit + ') at '
                                + (objective.x - this.me.x) + ', '
                                + objective.y - this.me.y);
                            return this.attack(objective.x - this.me.x,
                                               objective.y - this.me.y);
                        }

                        break;
                    }
                }

                // ask castle for another target if enemy castle is destroyed
                if (objective == null) {
                    this.target = null;
                    this.castle_talk(0xCD);
                }
            }

            // basic attacks
            // TODO: prioritise targets, instead of attacking first target
            // TODO: decide target to attack, somehow..
            var attackables = this.filter_by_attack_range(enemies);
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
                if (this.is_visible(this.target)) {
                    // TODO: attack mode: find best angle of attack - least
                    // dangerous square in range of target
                    // TODO: prefer spreading out units (same team)
                    // TODO: assume target is stationary (castle/church) -
                    // chasing is mostly pointless and rather dangerous
                    this.target = this.smear_centred(this.target);
                }

                else if (!this.is_passable(this.target)) {
                    this.target = this.smear_directed(this.target);
                }

                this.path = this.jump_point_search([this.me.x, this.me.y],
                                                   this.target);
            }

            // proceed to target destination
            if (this.path != null && this.path.length > 0) {
                var destination = this.take_step(this.pixelate(this.path),
                                                 this.me.unit);
                this.log('  - moving to destination: (' + destination[0] + ', '
                    + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }

        else if (this.me.unit == SPECS.PROPHET) {
            this.log('Prophet [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');
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

    get_visible_robots() {
        return this.getVisibleRobots();
    }

    get_visible_robot_map() {
        return this.getVisibleRobotMap();
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

        return reachables[Math.floor(Math.random() * reachables.length)];
    }

    smear_directed(square) {
        var x = square[0];
        var y = square[1];

        var reachables = [];
        for (var i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) {
                if (this.is_passable_and_empty([x + i, y + j])) {
                    reachables.push([x + i, y + j]);
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
            if (this.metric([this.me.x, this.me.y], resources[i]) < 9) {
                local_resources.push(resources[i]);
            }
        }

        return local_resources;
    }

    // TODO: modify adjacency functions to enable teleportation during
    // pathfinding
    astar(start, end, adjacency) {
        var trace = {};

        var G = {};
        var open_squares = {};

        G[start] = 0;
        open_squares[start] = this.metric(start, end);

        var closed_squares = {};

        while (Object.keys(open_squares).length > 0) {
            var head = null;
            var score = 0;

            for (var square in open_squares) {
                var square_score = parseInt(open_squares[square]);
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

                var total = parseInt(G[head]) + this.metric(head, square);

                if (open_squares[square] != undefined
                        && total >= parseInt(G[square])) {
                    continue;
                }

                trace[square] = head;

                G[square] = total;
                open_squares[square] = total + this.metric(square, end);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    identify_jump_points(head, end) {
        var jump_points = [];
        for (var i = 0; i < 8; i++) {
            var dx = this.compass[i][0];
            var dy = this.compass[i][1];

            var jump_point = this.jump(head, dx, dy, end);
            if (jump_point != null) {
                jump_points.push(jump_point);
            }
        }

        return jump_points;
    }

    jump(square, dx, dy, end) {
        var probe_x = square[0] + dx;
        var probe_y = square[1] + dy;

        if (!this.is_passable([probe_x, probe_y])) {
            return null;
        }

        if (probe_x == end[0] && probe_y == end[1]) {
            return end;
        }

        var head_x = probe_x;
        var head_y = probe_y;

        if (dx * dy != 0) {
            while (true) {
                if ((this.is_passable([head_x - dx, head_y + dy])
                     && !this.is_passable([head_x - dx, head_y]))
                        || (this.is_passable([head_x + dx, head_y - dy])
                            && !this.is_passable([head_x, head_y - dy]))) {
                    return [head_x, head_y];
                }

                if (this.jump([head_x, head_y], dx, 0, end) != null
                        || this.jump([head_x, head_y], 0, dy, end) != null) {
                    return [head_x, head_y];
                }

                head_x += dx;
                head_y += dy;

                if (!this.is_passable([head_x, head_y])) {
                    return null;
                }

                if (probe_x == end[0] && probe_y == end[1]) {
                    return end;
                }
            }
        }

        else if (dx != 0) {
            while (true) {
                if ((this.is_passable([head_x + dx, probe_y + 1])
                     && !this.is_passable([head_x, probe_y + 1]))
                        || (this.is_passable([head_x + dx, probe_y - 1])
                            && !this.is_passable([head_x, probe_y - 1]))) {
                    return [head_x, probe_y];
                }

                head_x += dx;

                if (!this.is_passable([head_x, probe_y])) {
                    return null;
                }

                if (probe_x == end[0] && probe_y == end[1]) {
                    return end;
                }
            }
        }

        else {
            while (true) {
                if ((this.is_passable([probe_x + 1, probe_y + dy])
                     && !this.is_passable([probe_x + 1, probe_y]))
                        || (this.is_passable([probe_x - 1, probe_y + dy])
                            && !this.is_passable([probe_x - 1, probe_y]))) {
                    return [probe_x, head_y];
                }

                head_y += dy;

                if (!this.is_passable([probe_x, head_y])) {
                    return null;
                }

                if (probe_x == end[0] && probe_y == end[1]) {
                    return end;
                }
            }
        }
    }

    jump_point_search(start, end) {
        var trace = {};

        var G = {};
        var closed = {};
        var points = [start];

        G[start] = 0;

        while (points.length > 0) {
            var head = points[0];
            points.splice(0, 1);

            if (head[0] == end[0] && head[1] == end[1]) {
                var path = [head];
                while (head in trace) {
                    head = trace[head];
                    path.push(head);
                }
                path.reverse();
                return path;
            }

            closed[head] = 0;

            var squares = this.identify_jump_points(head, end);
            for (var i = 0; i < squares.length; i++) {
                var square = squares[i];

                if (closed[square] == 0) {
                    continue;
                }

                var total = parseInt(G[head]) + this.metric(head, square);
                if (total >= parseInt(G[square])) {
                    continue;
                }

                G[square] = total;
                points.push(square);
                trace[square] = head;
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
                points.push([parseInt(path[i - 1][0] + j * direction[0]),
                             parseInt(path[i - 1][1] + j * direction[1])]);
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

    is_visible(square) {
        return this.get_visible_robot_map()[square[1]][square[0]] != -1;
    }

    get_visible_enemies() {
        var enemies = [];

        var visibles = this.get_visible_robots();
        for (var i = 0; i < visibles.length; i++) {
            if (visibles[i].team != this.me.team) {
                enemies.push(visibles[i]);
            }
        }

        return enemies;
    }

    in_attack_range(square) {
        const min_attack_range = [0, 0, 0, 1, 16, 1];
        const max_attack_range = [0, 0, 0, 16, 64, 16];

        var range = this.distance([this.me.x, this.me.y], square);
        return ((range <= max_attack_range[this.me.unit])
            && (range >= min_attack_range[this.me.unit]));
    }

    filter_by_attack_range(enemies) {
        var attackables = [];
        for (var i = 0; i < enemies.range; i++) {
            if (this.in_attack_range([enemies.x, enemies.y])) {
                attackables.push(enemies);
            }
        }

        return attackables;
    }
}
