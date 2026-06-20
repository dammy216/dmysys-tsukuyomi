---
name: util-scripts
description: Creating reusable helper modules with Util scripts and exports
metadata:
  tags: rive, scripting, util, helpers, modules, require
---

# Util Scripts

Util scripts are reusable modules that export helper functions. They don't run on their own but are imported by other scripts.

## Creating a Util Script

```lua
-- utils/math-helpers.lua
local exports = {}

function exports.clamp(value: number, min: number, max: number): number
  return math.max(min, math.min(max, value))
end

function exports.lerp(a: number, b: number, t: number): number
  return a + (b - a) * t
end

function exports.map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number
  local t = (value - inMin) / (inMax - inMin)
  return outMin + t * (outMax - outMin)
end

return exports
```

## Using Util Scripts

Import with `require()`:

```lua
-- In a Node script
local mathHelpers = require("utils/math-helpers")

type MyNode = {
  value: number,
  paint: Paint,
  path: Path,
}

function advance(self: MyNode, elapsed: number)
  -- Use imported function
  self.value = mathHelpers.clamp(self.value + elapsed, 0, 1)
end

return function(): Node<MyNode>
  return {
    advance = advance,
    value = 0,
    paint = Paint.new(),
    path = Path.new(),
  }
end
```

## Common Util Patterns

### Math Utilities

```lua
local exports = {}

-- Clamp value to range
function exports.clamp(value: number, min: number, max: number): number
  return math.max(min, math.min(max, value))
end

-- Linear interpolation
function exports.lerp(a: number, b: number, t: number): number
  return a + (b - a) * t
end

-- Inverse lerp (get t from value)
function exports.inverseLerp(a: number, b: number, value: number): number
  return (value - a) / (b - a)
end

-- Smooth step (ease in-out)
function exports.smoothstep(t: number): number
  return t * t * (3 - 2 * t)
end

-- Smoother step (more gradual ease)
function exports.smootherstep(t: number): number
  return t * t * t * (t * (t * 6 - 15) + 10)
end

-- Map value from one range to another
function exports.map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number
  local t = (value - inMin) / (inMax - inMin)
  return outMin + t * (outMax - outMin)
end

-- Wrap value to range
function exports.wrap(value: number, min: number, max: number): number
  local range = max - min
  return min + (value - min) % range
end

-- Distance between two points
function exports.distance(x1: number, y1: number, x2: number, y2: number): number
  local dx = x2 - x1
  local dy = y2 - y1
  return math.sqrt(dx * dx + dy * dy)
end

return exports
```

### Easing Functions

```lua
local exports = {}

-- Linear
function exports.linear(t: number): number
  return t
end

-- Quadratic
function exports.easeInQuad(t: number): number
  return t * t
end

function exports.easeOutQuad(t: number): number
  return 1 - (1 - t) * (1 - t)
end

function exports.easeInOutQuad(t: number): number
  if t < 0.5 then
    return 2 * t * t
  else
    return 1 - (-2 * t + 2) ^ 2 / 2
  end
end

-- Cubic
function exports.easeInCubic(t: number): number
  return t * t * t
end

function exports.easeOutCubic(t: number): number
  return 1 - (1 - t) ^ 3
end

function exports.easeInOutCubic(t: number): number
  if t < 0.5 then
    return 4 * t * t * t
  else
    return 1 - (-2 * t + 2) ^ 3 / 2
  end
end

-- Bounce
function exports.easeOutBounce(t: number): number
  local n1 = 7.5625
  local d1 = 2.75

  if t < 1 / d1 then
    return n1 * t * t
  elseif t < 2 / d1 then
    t = t - 1.5 / d1
    return n1 * t * t + 0.75
  elseif t < 2.5 / d1 then
    t = t - 2.25 / d1
    return n1 * t * t + 0.9375
  else
    t = t - 2.625 / d1
    return n1 * t * t + 0.984375
  end
end

-- Elastic
function exports.easeOutElastic(t: number): number
  if t == 0 or t == 1 then return t end
  return 2 ^ (-10 * t) * math.sin((t * 10 - 0.75) * (2 * math.pi) / 3) + 1
end

-- Back (overshoot)
function exports.easeInBack(t: number): number
  local c1 = 1.70158
  local c3 = c1 + 1
  return c3 * t * t * t - c1 * t * t
end

function exports.easeOutBack(t: number): number
  local c1 = 1.70158
  local c3 = c1 + 1
  return 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2
end

return exports
```

### Color Utilities

```lua
local exports = {}

-- Lighten color
function exports.lighten(color: Color, amount: number): Color
  return Color.lerp(color, Color.rgb(255, 255, 255), amount)
end

-- Darken color
function exports.darken(color: Color, amount: number): Color
  return Color.lerp(color, Color.rgb(0, 0, 0), amount)
end

-- Blend with alpha
function exports.blend(fg: Color, bg: Color, alpha: number): Color
  return Color.lerp(bg, fg, alpha)
end

-- Create color from HSL
function exports.hsl(h: number, s: number, l: number): Color
  -- h: 0-360, s: 0-1, l: 0-1
  local c = (1 - math.abs(2 * l - 1)) * s
  local x = c * (1 - math.abs((h / 60) % 2 - 1))
  local m = l - c / 2

  local r, g, b
  if h < 60 then r, g, b = c, x, 0
  elseif h < 120 then r, g, b = x, c, 0
  elseif h < 180 then r, g, b = 0, c, x
  elseif h < 240 then r, g, b = 0, x, c
  elseif h < 300 then r, g, b = x, 0, c
  else r, g, b = c, 0, x
  end

  return Color.rgb(
    math.floor((r + m) * 255),
    math.floor((g + m) * 255),
    math.floor((b + m) * 255)
  )
end

-- Complementary color
function exports.complement(color: Color): Color
  -- Simple RGB complement
  local r, g, b = color:getRGB()
  return Color.rgb(255 - r, 255 - g, 255 - b)
end

return exports
```

### Animation Utilities

```lua
local exports = {}

type Tween = {
  start: number,
  target: number,
  duration: number,
  elapsed: number,
  easing: (number) -> number,
  value: number,
  complete: boolean,
}

function exports.createTween(start: number, target: number, duration: number, easing: ((number) -> number)?): Tween
  return {
    start = start,
    target = target,
    duration = duration,
    elapsed = 0,
    easing = easing or function(t) return t end,
    value = start,
    complete = false,
  }
end

function exports.updateTween(tween: Tween, dt: number): number
  if tween.complete then
    return tween.target
  end

  tween.elapsed = tween.elapsed + dt

  if tween.elapsed >= tween.duration then
    tween.elapsed = tween.duration
    tween.complete = true
    tween.value = tween.target
  else
    local t = tween.elapsed / tween.duration
    local easedT = tween.easing(t)
    tween.value = tween.start + (tween.target - tween.start) * easedT
  end

  return tween.value
end

function exports.resetTween(tween: Tween, newTarget: number?)
  tween.start = tween.value
  tween.target = newTarget or tween.target
  tween.elapsed = 0
  tween.complete = false
end

return exports
```

### Vector Utilities

```lua
local exports = {}

function exports.add(a: Vec2D, b: Vec2D): Vec2D
  return Vec2D.xy(a.x + b.x, a.y + b.y)
end

function exports.subtract(a: Vec2D, b: Vec2D): Vec2D
  return Vec2D.xy(a.x - b.x, a.y - b.y)
end

function exports.scale(v: Vec2D, s: number): Vec2D
  return Vec2D.xy(v.x * s, v.y * s)
end

function exports.normalize(v: Vec2D): Vec2D
  local len = v:length()
  if len < 0.0001 then
    return Vec2D.origin()
  end
  return Vec2D.xy(v.x / len, v.y / len)
end

function exports.dot(a: Vec2D, b: Vec2D): number
  return a.x * b.x + a.y * b.y
end

function exports.cross(a: Vec2D, b: Vec2D): number
  return a.x * b.y - a.y * b.x
end

function exports.rotate(v: Vec2D, angle: number): Vec2D
  local cos = math.cos(angle)
  local sin = math.sin(angle)
  return Vec2D.xy(
    v.x * cos - v.y * sin,
    v.x * sin + v.y * cos
  )
end

function exports.lerpVec(a: Vec2D, b: Vec2D, t: number): Vec2D
  return Vec2D.xy(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t
  )
end

return exports
```

## Using Multiple Imports

```lua
local mathUtils = require("utils/math")
local easing = require("utils/easing")
local colors = require("utils/colors")

type AnimatedNode = {
  progress: number,
  color: Color,
}

function advance(self: AnimatedNode, elapsed: number)
  self.progress = mathUtils.clamp(self.progress + elapsed * 0.5, 0, 1)

  local easedProgress = easing.easeOutCubic(self.progress)
  self.color = colors.hsl(easedProgress * 360, 0.8, 0.5)
end

return function(): Node<AnimatedNode>
  return {
    advance = advance,
    progress = 0,
    color = Color.rgb(255, 255, 255),
  }
end
```

## Best Practices

1. **Export a table** - Return `exports` table, not individual functions
2. **Pure functions** - Utils should not have side effects
3. **Type annotations** - Document parameter and return types
4. **Single responsibility** - Group related utilities together
5. **No dependencies on Node** - Utils shouldn't need renderer/context

## Common Pitfalls

**Returning the wrong thing**
```lua
-- Bad: returns function instead of table
return function clamp(value, min, max)
  return math.max(min, math.min(max, value))
end

-- Good: returns exports table
local exports = {}
function exports.clamp(value, min, max)
  return math.max(min, math.min(max, value))
end
return exports
```

**Mutating shared state**
```lua
-- Bad: shared mutable state
local exports = {}
exports.counter = 0

function exports.increment()
  exports.counter = exports.counter + 1  -- Shared across all imports!
  return exports.counter
end

-- Good: return new values, don't mutate
function exports.increment(counter: number): number
  return counter + 1
end
```

**Circular dependencies**
```lua
-- Bad: A requires B, B requires A
-- utils/a.lua
local b = require("utils/b")  -- Requires B

-- utils/b.lua
local a = require("utils/a")  -- Requires A (circular!)

-- Good: extract shared code to third module
-- utils/shared.lua (no dependencies)
-- utils/a.lua (requires shared)
-- utils/b.lua (requires shared)
```
