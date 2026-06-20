---
name: getting-started
description: Introduction to Rive Scripting - script types, editor basics, and Luau syntax fundamentals
metadata:
  tags: rive, scripting, luau, introduction, basics
---

# Getting Started with Rive Scripting

Rive Scripting uses Luau to create interactive behaviors and procedural graphics inside Rive animations.

## Script Types

### Node Scripts
Run on any Rive object. Handle drawing, animation, and pointer events.

```lua
type Circle = {
  radius: number,
  path: Path,
  paint: Paint,
}

function draw(self: Circle, renderer: Renderer)
  self.path:reset()
  self.path:addOval(AABB.xywh(0, 0, self.radius * 2, self.radius * 2))
  renderer:drawPath(self.path, self.paint)
end

return function(): Node<Circle>
  return {
    draw = draw,
    radius = 50,
    path = Path.new(),
    paint = Paint.new(),
  }
end
```

### Layout Scripts
Control how children are sized and positioned.

```lua
function measure(self, width: number, height: number): Vec2D
  return Vec2D.xy(100, 100) -- Ideal size
end

function resize(self, width: number, height: number)
  -- Respond to actual size
end

return function(): Layout<{}>
  return { measure = measure, resize = resize }
end
```

### Converter Scripts
Transform data between sources and bound properties.

```lua
function convert(self, input: DataValue): DataValue
  return input * 2
end

return function(): Converter<{}>
  return { convert = convert }
end
```

### PathEffect Scripts
Modify paths procedurally (dashes, distortions, etc).

```lua
function effect(self, source: PathData): PathData
  -- Transform the path
  return source
end

return function(): PathEffect<{}>
  return { effect = effect }
end
```

### Util Scripts
Reusable helpers shared across scripts.

```lua
local exports = {}

function exports.clamp(value: number, min: number, max: number): number
  return math.max(min, math.min(max, value))
end

return exports
```

## Creating a Script

1. Select an object in the Rive editor
2. Open the Scripts panel
3. Click "+" to add a new script
4. Choose the script type
5. Write your Luau code
6. Scripts run automatically when the animation plays

## Luau Basics

### Types

```lua
-- Primitive types
local count: number = 10
local name: string = "player"
local active: boolean = true

-- Table types
type Player = {
  name: string,
  score: number,
  items: {string},
}

-- Optional types
local maybeValue: number? = nil
```

### Functions

```lua
-- Basic function
local function add(a: number, b: number): number
  return a + b
end

-- Method syntax (used in Rive protocols)
function MyType.method(self: MyType, arg: number)
  self.value = arg
end

-- Or with colon syntax
function MyType:method(arg: number)
  self.value = arg
end
```

### Control Flow

```lua
-- Conditionals
if condition then
  -- code
elseif other then
  -- code
else
  -- code
end

-- Loops
for i = 1, 10 do
  print(i)
end

for i = 10, 1, -1 do
  print(i) -- Countdown
end

for key, value in pairs(table) do
  print(key, value)
end

while condition do
  -- code
end
```

### Tables

```lua
-- Array-like
local list = {1, 2, 3, 4, 5}
print(list[1]) -- 1 (1-indexed!)

-- Dictionary-like
local dict = {name = "test", value = 42}
print(dict.name) -- "test"
print(dict["value"]) -- 42

-- Mixed
local mixed = {
  name = "player",
  10, 20, 30, -- Indexed 1, 2, 3
}
```

## Script Lifecycle

1. **Factory function called** - Create and return your state
2. **init()** - Called once when script starts (Node scripts)
3. **advance(elapsed)** - Called each frame with delta time
4. **update()** - Called after advance for any updates
5. **draw(renderer)** - Called to render (Node scripts)

## Best Practices

1. **Initialize in factory** - Create Path, Paint objects in the factory function, not in draw()
2. **Reuse objects** - Call `path:reset()` instead of creating new paths each frame
3. **Type everything** - Luau's type system catches errors early
4. **Keep state in self** - All mutable state should be in your typed table

## Common Pitfalls

**Creating objects in draw()**
```lua
-- Bad: creates new Path every frame
function draw(self, renderer: Renderer)
  local path = Path.new() -- Memory leak!
  -- ...
end

-- Good: reuse path from self
function draw(self: MyNode, renderer: Renderer)
  self.path:reset() -- Reuse existing path
  -- ...
end
```

**Forgetting to return factory function**
```lua
-- Bad: returns table directly
return { draw = draw }

-- Good: returns function that creates table
return function(): Node<MyState>
  return { draw = draw, ... }
end
```
