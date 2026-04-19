# LEXI PYTHON SCRIPT: lexi_app
# Added: 2026-04-19T20:44:03.484Z
# Description: Kivy app that runs Lexi's code

import os
import sys
from kivy.app import App
from kivy.uix.label import Label
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.textinput import TextInput
from kivy.uix.popup import Popup
import json
import requests
import webbrowser

class LexiApp(App):
    def build(self):
        self.layout = BoxLayout(orientation='vertical')
        self.text_input = TextInput(multiline=False, size_hint=(1, 0.1))
        self.layout.add_widget(self.text_input)
        self.button = Button(text='Run Command', size_hint=(1, 0.1))
        self.button.bind(on_press=self.run_command)
        self.layout.add_widget(self.button)
        self.label = Label(text='', size_hint=(1, 0.8))
        self.layout.add_widget(self.label)
        return self.layout

    def run_command(self, instance):
        command = self.text_input.text
        try:
            output = os.popen(command).read()
            self.label.text = output
        except:
            popup = Popup(title='Error', content=Label(text='Command failed'), size_hint=(None, None), size=(400, 100))
            popup.open()

lexi_app = LexiApp()
lexi_app.run()