class Graph():
    """ class for A* search """

    directions = [
        (1, -1), (1, 1), (-1, 1), (-1, -1),
        (0, -1), (1, 0), (0, 1), (-1, 0)
        ]

    def __init__(self, graph):
        """ initialisation """

        self.graph = graph
        self.width = len(graph)
        self.height = len(graph[0])

    def get_neighbours(self, position):
        """ eight adjacent squares """

        n = []
        for dx, dy in self.directions:
            x = position[0] + dx
            y = position[1] + dy

            if x < 0 or x > self.width - 1 or y < 0 or y > self.height - 1:
                continue

            if not self.graph[x][y]:
                continue

            n.append((x, y))

        return n

    def cost(self, start, end):
        """ cost/heuristic: Chebyshev distance """

        return max(map(lambda r, s: abs(r - s), start, end))


def astar(graph, start, end):
    """ A* search algorithm """

    G = {}
    F = {}

    G[start] = 0
    F[start] = graph.cost(start, end)

    squares_closed = set()
    squares_open = set([start])
    trace = {}

    while squares_open:
        head = None
        score = None

        for square in squares_open:
            if head is None or F[square] < score:
                head = square
                score = F[square]

        if head == end:
            path = [head]
            while head in trace:
                head = trace[head]
                path.append(head)
            path.reverse()
            return path, F[end]

        squares_open.remove(head)
        squares_closed.add(head)

        for square in graph.get_neighbours(head):
            if square in squares_closed:
                continue

            total = G[head] + graph.cost(head, square)

            if square not in squares_open:
                squares_open.add(square)
            elif total >= G[square]:
                continue

            trace[square] = head
            G[square] = total

            H = graph.cost(square, end)
            F[square] = G[square] + H

    return None


if __name__ == "__main__":
    chart = [
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ]

    graph_test = Graph(chart)

    print(astar(graph_test, (0, 0), (0, 8)))
