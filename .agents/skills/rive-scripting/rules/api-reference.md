---
name: api-reference
description: Quick reference for Rive Scripting APIs - Path, Paint, Renderer, Vec2D, and more
metadata:
  tags: rive, scripting, api, reference, documentation
---

# Rive Scripting API Reference

Quick reference for commonly used Rive Scripting APIs.

## Path

Vector path construction and manipulation.

```lua
local path = Path.new()

-- Commands
path:reset()                                    -- Clear all commands
path:moveTo(Vec2D.xy(x, y))                    -- Move to point
path:lineTo(Vec2D.xy(x, y))                    -- Line to point
path:quadTo(control, end)                       -- Quadratic bezier
path:cubicTo(control1, control2, end)          -- Cubic bezier
path:close()                                    -- Close path

-- Shapes
path:addRect(AABB.xywh(x, y, w, h))            -- Add rectangle
path:addRoundedRect(aabb, radius)              -- Add rounded rect
path:addOval(AABB.xywh(x, y, w, h))            -- Add ellipse
path:addPath(otherPath)                         -- Add another path

-- Operations
path:transform(Mat2D.fromScale(2, 2))          -- Transform path
path:contains(Vec2D.xy(x, y))                  -- Hit test (boolean)
```

## Paint

Styling for fills and strokes.

```lua
local paint = Paint.new()

-- Style
paint:setStyle(PaintStyle.fill)                 -- Fill mode
paint:setStyle(PaintStyle.stroke)               -- Stroke mode

-- Stroke properties
paint:setThickness(3)                           -- Stroke width
paint:setStrokeCap(StrokeCap.round)            -- round, butt, square
paint:setStrokeJoin(StrokeJoin.round)          -- round, miter, bevel

-- Color
paint:setColor(Color.rgb(r, g, b))             -- RGB (0-255)
paint:setColor(Color.rgba(r, g, b, a))         -- RGBA (0-255)

-- Gradient
paint:setGradient(gradient)                     -- Apply gradient
```

## Color

Color creation and manipulation.

```lua
-- Creation
Color.rgb(255, 100, 50)                         -- RGB (0-255 each)
Color.rgba(255, 100, 50, 128)                   -- RGBA (0-255 each)

-- Operations
Color.lerp(color1, color2, t)                   -- Interpolate (t: 0-1)

-- Access (on color instance)
local r, g, b = color:getRGB()
local r, g, b, a = color:getRGBA()
```

## Gradient

Linear and radial gradients.

```lua
-- Linear gradient
local linear = Gradient.linear(
  Vec2D.xy(startX, startY),
  Vec2D.xy(endX, endY),
  {
    {0, Color.rgb(255, 0, 0)},    -- Stop at 0%
    {0.5, Color.rgb(0, 255, 0)},  -- Stop at 50%
    {1, Color.rgb(0, 0, 255)},    -- Stop at 100%
  }
)

-- Radial gradient
local radial = Gradient.radial(
  Vec2D.xy(centerX, centerY),
  radius,
  {
    {0, Color.rgb(255, 255, 255)},  -- Center
    {1, Color.rgb(0, 0, 0)},        -- Edge
  }
)
```

## Renderer

Drawing and transformations.

```lua
-- Drawing
renderer:drawPath(path, paint)                  -- Draw path with paint

-- Transform stack
renderer:save()                                 -- Push state
renderer:restore()                              -- Pop state

-- Transforms
renderer:translate(Vec2D.xy(x, y))             -- Move origin
renderer:rotate(angle)                          -- Rotate (radians)
renderer:scale(Vec2D.xy(sx, sy))               -- Scale
renderer:transform(Mat2D.fromRotation(angle))  -- Apply matrix

-- Clipping
renderer:clipPath(path)                         -- Clip to path
```

## Vec2D

2D vector operations.

```lua
-- Creation
Vec2D.xy(x, y)                                  -- From components
Vec2D.origin()                                  -- (0, 0)

-- Properties
local x = vec.x
local y = vec.y

-- Methods
vec:length()                                    -- Magnitude
vec:normalize()                                 -- Unit vector
Vec2D.dot(a, b)                                -- Dot product
```

## AABB

Axis-aligned bounding box.

```lua
-- Creation
AABB.xywh(x, y, width, height)                 -- From x, y, w, h
AABB.ltrb(left, top, right, bottom)            -- From edges

-- Properties
aabb.minX, aabb.minY                            -- Top-left
aabb.maxX, aabb.maxY                            -- Bottom-right

-- Methods
aabb:width()                                    -- Width
aabb:height()                                   -- Height
aabb:center()                                   -- Center point (Vec2D)
aabb:contains(Vec2D.xy(x, y))                  -- Hit test (boolean)
```

## Mat2D

2D transformation matrix.

```lua
-- Creation
Mat2D.identity()                                -- Identity matrix
Mat2D.fromTranslation(x, y)                    -- Translation
Mat2D.fromRotation(angle)                       -- Rotation (radians)
Mat2D.fromScale(sx, sy)                        -- Scale

-- Operations
mat:multiply(other)                             -- Combine matrices
mat:invert()                                    -- Inverse matrix
mat:transformPoint(Vec2D.xy(x, y))             -- Transform point
```

## ViewModel

Data binding access.

```lua
-- Get ViewModel
local vm = self.context:getViewModel()

-- Read values
vm:getNumber("propName")
vm:getString("propName")
vm:getBoolean("propName")
vm:getColor("propName")
vm:getEnum("propName")

-- Write values
vm:setNumber("propName", 42)
vm:setString("propName", "text")
vm:setBoolean("propName", true)
vm:setColor("propName", Color.rgb(255, 0, 0))
vm:setEnum("propName", "value")

-- Triggers
vm:fireTrigger("triggerName")
vm:onTrigger("triggerName", function() end)

-- Subscriptions
local unsubscribe = vm:subscribe("propName", function(newValue)
  -- Handle change
end)
unsubscribe() -- Clean up
```

## ContourMeasure

Path measurement for effects.

```lua
local measure = ContourMeasure.new(contour)

measure:length()                                -- Total path length
measure:getPosition(distance)                   -- Point at distance (Vec2D)
measure:getTangent(distance)                    -- Tangent at distance (Vec2D)
```

## PaintStyle Enum

```lua
PaintStyle.fill                                 -- Filled shape
PaintStyle.stroke                               -- Outlined shape
```

## StrokeCap Enum

```lua
StrokeCap.butt                                  -- Flat cap
StrokeCap.round                                 -- Rounded cap
StrokeCap.square                                -- Square cap (extends)
```

## StrokeJoin Enum

```lua
StrokeJoin.miter                                -- Sharp corners
StrokeJoin.round                                -- Rounded corners
StrokeJoin.bevel                                -- Beveled corners
```

## Protocol Return Types

```lua
-- Node script
return function(): Node<MyState>
  return { init = init, advance = advance, draw = draw, ... }
end

-- Layout script
return function(): Layout<MyState>
  return { measure = measure, resize = resize, draw = draw, ... }
end

-- Converter script
return function(): Converter<MyState>
  return { convert = convert, reverseConvert = reverseConvert, ... }
end

-- PathEffect script
return function(): PathEffect<MyState>
  return { effect = effect, ... }
end
```

## Lifecycle Methods

### Node Protocol
| Method | Signature | Called |
|--------|-----------|--------|
| `init` | `(self) -> ()` | Once at start |
| `advance` | `(self, elapsed: number) -> ()` | Every frame |
| `update` | `(self) -> ()` | After advance |
| `draw` | `(self, renderer: Renderer) -> ()` | Every frame |
| `cleanup` | `(self) -> ()` | When removed |

### Pointer Events (Node)
| Method | Signature | Return |
|--------|-----------|--------|
| `pointerDown` | `(self, pos: Vec2D, id?: number) -> boolean` | true to capture |
| `pointerMove` | `(self, pos: Vec2D, id?: number) -> ()` | After capture |
| `pointerUp` | `(self, pos: Vec2D, id?: number) -> ()` | After capture |

### Layout Protocol (extends Node)
| Method | Signature | Return |
|--------|-----------|--------|
| `measure` | `(self, w: number, h: number) -> Vec2D` | Ideal size |
| `resize` | `(self, w: number, h: number) -> ()` | Actual size set |

### Converter Protocol
| Method | Signature | Return |
|--------|-----------|--------|
| `convert` | `(self, input: DataValue) -> DataValue` | Transformed value |
| `reverseConvert` | `(self, input: DataValue) -> DataValue` | Reverse transform |

### PathEffect Protocol
| Method | Signature | Return |
|--------|-----------|--------|
| `effect` | `(self, source: PathData) -> PathData` | Modified path |

## Math Constants

```lua
math.pi                                         -- 3.14159...
math.huge                                       -- Infinity
```

## Common Math Functions

```lua
math.sin(x)                                     -- Sine (radians)
math.cos(x)                                     -- Cosine (radians)
math.tan(x)                                     -- Tangent (radians)
math.sqrt(x)                                    -- Square root
math.abs(x)                                     -- Absolute value
math.floor(x)                                   -- Round down
math.ceil(x)                                    -- Round up
math.min(a, b, ...)                            -- Minimum
math.max(a, b, ...)                            -- Maximum
math.rad(degrees)                               -- Degrees to radians
math.deg(radians)                               -- Radians to degrees
math.random()                                   -- Random 0-1
math.random(n)                                  -- Random 1-n
math.random(m, n)                               -- Random m-n
```

## Animation

Control playback of Rive animations from scripts.

```lua
local anim = artboard:animation('AnimationName')

-- Properties
anim.duration                                   -- Duration in seconds (read-only)

-- Playback control
anim:advance(seconds)                           -- Advance by time, returns true if playing
anim:setTime(seconds)                           -- Set time in seconds
anim:setTimeFrames(frames)                      -- Set time in frames
anim:setTimePercentage(0.5)                     -- Set time as 0-1 percentage
```

### Example

```lua
local anim = artboard:animation('Idle')
anim:setTime(0)

function advance(self: MyNode, seconds: number): boolean
  local playing = anim:advance(seconds)
  return playing
end
```

## Artboard

Access and control artboards, including nested artboards.

```lua
-- Properties
artboard.width                                  -- Width (read/write)
artboard.height                                 -- Height (read/write)
artboard.frameOrigin                            -- Origin at frame origin (boolean)
artboard.data                                   -- Typed ViewModel data

-- Methods
artboard:advance(seconds)                       -- Advance by time, returns true to continue
artboard:draw(renderer)                         -- Draw using renderer
artboard:instance()                             -- Create independent instance
artboard:animation('name')                      -- Get animation by name
artboard:node('name')                           -- Get node by name (or nil)
artboard:bounds()                               -- Returns min, max Vec2D points
artboard:addToPath(path, transform?)            -- Add geometry to path

-- Pointer events (returns 0 if no hit)
artboard:pointerDown(event)
artboard:pointerUp(event)
artboard:pointerMove(event)
artboard:pointerExit(event)
```

### Example: Bounds

```lua
local minPt, maxPt = artboard:bounds()
local width = maxPt.x - minPt.x
local height = maxPt.y - minPt.y
```

### Example: Dynamic Instantiation

```lua
type GameScene = {
  enemyTemplate: Input<Artboard<Data.Enemy>>,
  enemies: { Artboard<Data.Enemy> },
}

function createEnemy(self: GameScene, x: number, y: number)
  local enemy = self.enemyTemplate:instance()
  table.insert(self.enemies, enemy)
end

function draw(self: GameScene, renderer: Renderer)
  for _, enemy in self.enemies do
    renderer:save()
    renderer:transform(Mat2D.fromTranslate(x, y))
    enemy:draw(renderer)
    renderer:restore()
  end
end
```

## BlendMode

Compositing modes for rendering.

```lua
-- Available blend modes
'srcOver'                                       -- Source over destination (default)
'screen'                                        -- Screen blend
'overlay'                                       -- Overlay blend
'darken'                                        -- Darken
'lighten'                                       -- Lighten
'colorDodge'                                    -- Color dodge
'colorBurn'                                     -- Color burn
'hardLight'                                     -- Hard light
'softLight'                                     -- Soft light
'difference'                                    -- Difference
'exclusion'                                     -- Exclusion
'multiply'                                      -- Multiply
'hue'                                           -- Hue blend
'saturation'                                    -- Saturation blend
'color'                                         -- Color blend
'luminosity'                                    -- Luminosity blend

-- Usage with Paint
paint:setBlendMode('multiply')
```

## Context

Access to update scheduling and view model.

```lua
-- Methods
context:markNeedsUpdate()                       -- Request update on next frame
context:viewModel()                             -- Get ViewModel for data binding

-- Usage in init
function init(self: MyNode, context: Context): boolean
  self.context = context
  local vm = context:viewModel()
  return true
end
```

## PathMeasure

Measure and sample points along a path.

```lua
local measure = PathMeasure.new(path)

measure:length()                                -- Total path length
measure:isClosed()                              -- Whether path is closed

-- Get point and tangent at distance
local pos = measure:getPosition(distance)       -- Vec2D position
local tan = measure:getTangent(distance)        -- Vec2D tangent direction

-- Get segment of path
measure:getSegment(startDist, endDist, destPath, startWithMove)
```

### Example: Animate Along Path

```lua
type PathFollower = {
  path: Path,
  paint: Paint,
  dot: Paint,
  measure: PathMeasure?,
  time: number,
  speed: number,
}

function init(self: PathFollower)
  -- Build a curved path
  self.path:moveTo(Vec2D.xy(0, 50))
  self.path:cubicTo(
    Vec2D.xy(50, 0),
    Vec2D.xy(150, 100),
    Vec2D.xy(200, 50)
  )
  self.measure = PathMeasure.new(self.path)
end

function advance(self: PathFollower, elapsed: number)
  self.time = self.time + elapsed * self.speed
end

function draw(self: PathFollower, renderer: Renderer)
  -- Draw the path
  renderer:drawPath(self.path, self.paint)

  -- Draw dot at current position
  if self.measure then
    local len = self.measure:length()
    local dist = (self.time % 1) * len
    local pos = self.measure:getPosition(dist)

    local dotPath = Path.new()
    dotPath:addOval(AABB.xywh(pos.x - 5, pos.y - 5, 10, 10))
    renderer:drawPath(dotPath, self.dot)
  end
end
```

## Input

Typed inputs exposed to the Rive editor.

```lua
type MyNode = {
  speed: Input<number>,
  color: Input<Color>,
  enabled: Input<boolean>,
  data: Input<Data.Character>,           -- ViewModel input
  template: Input<Artboard<Data.Enemy>>, -- Artboard input
}

-- Reading values
local s = self.speed                            -- Direct access
local c = self.color

-- Listening for changes
self.speed:addListener(function()
  print("Speed changed to:", self.speed)
end)

-- Mark late-bound inputs in factory
return function(): Node<MyNode>
  return {
    speed = 1.0,                                -- Default value
    color = Color.rgb(255, 255, 255),
    enabled = true,
    data = late(),                              -- Assigned in editor
    template = late(),
  }
end
```

## DataValue Types

Types for converter scripts and data binding.

```lua
-- Create typed values
DataValue.number()                              -- DataValueNumber
DataValue.string()                              -- DataValueString
DataValue.boolean()                             -- DataValueBoolean
DataValue.color()                               -- DataValueColor

-- Type checking
input:isNumber()
input:isString()
input:isBoolean()
input:isColor()

-- Access value
local num = (input :: DataValueNumber).value
local str = (input :: DataValueString).value
```

### Converter Example

```lua
type NumToStr = {}

function convert(self: NumToStr, input: DataInputs): DataOutput
  local out: DataValueString = DataValue.string()
  if input:isNumber() then
    out.value = tostring((input :: DataValueNumber).value)
  else
    out.value = ""
  end
  return out
end

return function(): Converter<NumToStr, DataValueNumber, DataValueString>
  return { convert = convert }
end
```
