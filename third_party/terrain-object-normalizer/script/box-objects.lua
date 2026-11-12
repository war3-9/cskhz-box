package.path = '.\\?.lua;.\\?\\init.lua;' .. package.path
package.cpath = '..\\bin\\?.dll;' .. package.cpath
require 'utility'
local input, output = arg[1], arg[2]
arg = { 'obj', input, output }
local errors = 0
local messager = {}
for _, key in ipairs { 'text', 'raw', 'title' } do messager[key] = function(value) print(value) end end
messager.progress = function() end
messager.wait = function() end
messager.report = function(kind, level, content, tip)
    print(level, kind, content, tip)
    if level == 1 then errors = errors + 1 end
end
messager.exit = function(kind, text) print(kind, text) end
package.loaded['share.messager'] = messager
require('backend.convert')('obj')
if errors > 0 then os.exit(2) end
