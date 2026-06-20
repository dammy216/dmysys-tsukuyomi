---
name: converter-scripts
description: Data converters for transforming values between data sources and bound properties
metadata:
  tags: rive, scripting, converter, data-binding, transform
---

# Converter Scripts

Converter scripts transform data between sources and bound properties. Use them for formatting, unit conversion, or complex data transformations.

## Converter Protocol

```lua
type TemperatureConverter = {
  unit: string,  -- "celsius" or "fahrenheit"
}

-- Transform data from source to display
function convert(self: TemperatureConverter, input: DataValue): DataValue
  if self.unit == "fahrenheit" then
    -- Convert Celsius to Fahrenheit
    return input * 9 / 5 + 32
  end
  return input
end

-- Transform data from display back to source (optional)
function reverseConvert(self: TemperatureConverter, input: DataValue): DataValue
  if self.unit == "fahrenheit" then
    -- Convert Fahrenheit to Celsius
    return (input - 32) * 5 / 9
  end
  return input
end

return function(): Converter<TemperatureConverter>
  return {
    convert = convert,
    reverseConvert = reverseConvert,
    unit = "fahrenheit",
  }
end
```

## DataValue Types

Converters work with `DataValue` which can be:

- `number` - Numeric values
- `string` - Text values
- `boolean` - True/false values
- `Color` - Color values

```lua
function convert(self, input: DataValue): DataValue
  -- Check type if needed
  if type(input) == "number" then
    return input * 2
  elseif type(input) == "string" then
    return string.upper(input)
  elseif type(input) == "boolean" then
    return not input
  end
  return input
end
```

## One-Way vs Two-Way Converters

### One-Way (convert only)

For display-only transformations:

```lua
type Formatter = {}

function convert(self: Formatter, input: DataValue): DataValue
  -- Format number as percentage
  return string.format("%.0f%%", input * 100)
end

return function(): Converter<Formatter>
  return {
    convert = convert,
  }
end
```

### Two-Way (convert and reverseConvert)

For editable values:

```lua
type CurrencyConverter = {
  rate: number,  -- Exchange rate
}

function convert(self: CurrencyConverter, input: DataValue): DataValue
  -- Source to display
  return input * self.rate
end

function reverseConvert(self: CurrencyConverter, input: DataValue): DataValue
  -- Display to source
  return input / self.rate
end

return function(): Converter<CurrencyConverter>
  return {
    convert = convert,
    reverseConvert = reverseConvert,
    rate = 1.1,
  }
end
```

## Common Converter Examples

### Number Formatting

```lua
type NumberFormatter = {
  decimals: number,
  prefix: string,
  suffix: string,
}

function convert(self: NumberFormatter, input: DataValue): DataValue
  local format = "%." .. self.decimals .. "f"
  return self.prefix .. string.format(format, input) .. self.suffix
end

return function(): Converter<NumberFormatter>
  return {
    convert = convert,
    decimals = 2,
    prefix = "$",
    suffix = "",
  }
end
```

### Percentage Converter

```lua
type PercentConverter = {}

function convert(self: PercentConverter, input: DataValue): DataValue
  -- 0-1 to 0-100
  return input * 100
end

function reverseConvert(self: PercentConverter, input: DataValue): DataValue
  -- 0-100 to 0-1
  return input / 100
end

return function(): Converter<PercentConverter>
  return {
    convert = convert,
    reverseConvert = reverseConvert,
  }
end
```

### Boolean to String

```lua
type BoolToString = {
  trueText: string,
  falseText: string,
}

function convert(self: BoolToString, input: DataValue): DataValue
  if input then
    return self.trueText
  else
    return self.falseText
  end
end

return function(): Converter<BoolToString>
  return {
    convert = convert,
    trueText = "Yes",
    falseText = "No",
  }
end
```

### Color Intensity

```lua
type ColorIntensity = {
  baseColor: Color,
}

function convert(self: ColorIntensity, input: DataValue): DataValue
  -- Input is 0-1, output is color with intensity
  local intensity = math.max(0, math.min(1, input))
  return Color.lerp(Color.rgb(0, 0, 0), self.baseColor, intensity)
end

return function(): Converter<ColorIntensity>
  return {
    convert = convert,
    baseColor = Color.rgb(255, 100, 100),
  }
end
```

### Clamping Converter

```lua
type Clamp = {
  min: number,
  max: number,
}

function convert(self: Clamp, input: DataValue): DataValue
  return math.max(self.min, math.min(self.max, input))
end

function reverseConvert(self: Clamp, input: DataValue): DataValue
  return math.max(self.min, math.min(self.max, input))
end

return function(): Converter<Clamp>
  return {
    convert = convert,
    reverseConvert = reverseConvert,
    min = 0,
    max = 100,
  }
end
```

### Mapping Ranges

```lua
type RangeMapper = {
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
}

function convert(self: RangeMapper, input: DataValue): DataValue
  local normalized = (input - self.inputMin) / (self.inputMax - self.inputMin)
  return self.outputMin + normalized * (self.outputMax - self.outputMin)
end

function reverseConvert(self: RangeMapper, input: DataValue): DataValue
  local normalized = (input - self.outputMin) / (self.outputMax - self.outputMin)
  return self.inputMin + normalized * (self.inputMax - self.inputMin)
end

return function(): Converter<RangeMapper>
  return {
    convert = convert,
    reverseConvert = reverseConvert,
    inputMin = 0,
    inputMax = 100,
    outputMin = 0,
    outputMax = 1,
  }
end
```

### Date Formatting

```lua
type DateFormatter = {
  format: string,  -- "short", "long", "iso"
}

function convert(self: DateFormatter, input: DataValue): DataValue
  -- Assuming input is a timestamp
  local date = os.date("*t", input)

  if self.format == "short" then
    return string.format("%02d/%02d/%d", date.month, date.day, date.year)
  elseif self.format == "long" then
    local months = {"Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
    return string.format("%s %d, %d", months[date.month], date.day, date.year)
  else
    return string.format("%d-%02d-%02d", date.year, date.month, date.day)
  end
end

return function(): Converter<DateFormatter>
  return {
    convert = convert,
    format = "short",
  }
end
```

## Chaining Converters

Multiple converters can be chained in the Rive editor. Each converter's output becomes the next converter's input.

```lua
-- Converter 1: Clamp to 0-100
type Clamp = {}
function convert(self: Clamp, input: DataValue): DataValue
  return math.max(0, math.min(100, input))
end

-- Converter 2: Add % suffix
type PercentSuffix = {}
function convert(self: PercentSuffix, input: DataValue): DataValue
  return string.format("%.0f%%", input)
end

-- Result: 150 -> 100 -> "100%"
```

## Best Practices

1. **Handle nil gracefully** - Check for nil input values
2. **Preserve type when possible** - If input is number, output number
3. **Implement reverseConvert for editable values** - Required for two-way binding
4. **Keep conversions pure** - Don't modify external state
5. **Document expected types** - Use comments for clarity

## Common Pitfalls

**Not handling type mismatches**
```lua
-- Bad: assumes number
function convert(self, input: DataValue): DataValue
  return input * 2  -- Crashes if input is string
end

-- Good: check type
function convert(self, input: DataValue): DataValue
  if type(input) == "number" then
    return input * 2
  end
  return input
end
```

**Inconsistent reverse conversion**
```lua
-- Bad: convert and reverseConvert don't match
function convert(self, input): DataValue
  return math.floor(input)  -- Loses precision
end

function reverseConvert(self, input): DataValue
  return input  -- Can't restore original
end

-- This can cause issues with two-way binding
```

**Forgetting to return**
```lua
-- Bad: missing return
function convert(self, input: DataValue): DataValue
  local result = input * 2
  -- Forgot to return!
end

-- Good: always return
function convert(self, input: DataValue): DataValue
  return input * 2
end
```
